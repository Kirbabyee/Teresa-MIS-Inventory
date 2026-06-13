-- ═══════════════════════════════════════════════════════════════════
-- Migration 005: Exponential Backoff Login Rate Limiter
-- Tracks multi-vector (email + IP + device fingerprint) login
-- failures with escalating lockout tiers.
-- ═══════════════════════════════════════════════════════════════════

-- ── Tier configuration (minutes) ────────────────────────────────
-- Tier 1:  5 minutes
-- Tier 2:  15 minutes
-- Tier 3:  30 minutes
-- Tier 4:  60 minutes (severe)
-- Tier 5:  Permanent ban (15+ failures — requires admin reset to clear)
CREATE OR REPLACE FUNCTION get_lockout_duration_minutes(tier int)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN tier <= 1 THEN 5
    WHEN tier = 2  THEN 15
    WHEN tier = 3  THEN 30
    WHEN tier = 4  THEN 60
    ELSE 525600  -- Tier 5 → 365 days (permanent ban, effectively)
  END;
$$;

-- ── Main tracking table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.login_attempts_tracker (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Composite identity vectors
  identifier_hash    text NOT NULL,      -- SHA-256(client_ip + device_fingerprint)
  email              text NOT NULL,      -- Normalized email address
  -- State counters
  consecutive_failures integer NOT NULL DEFAULT 0,
  lockout_tier         integer NOT NULL DEFAULT 0,
  -- Suspension window
  suspended_until      timestamptz,
  -- Metadata
  last_ip              inet,
  last_fingerprint     text NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Composite unique key: one record per email + device vector
CREATE UNIQUE INDEX IF NOT EXISTS idx_login_tracker_identity
  ON public.login_attempts_tracker (email, identifier_hash);

-- Lookups for active suspensions
CREATE INDEX IF NOT EXISTS idx_login_tracker_suspended
  ON public.login_attempts_tracker (email, suspended_until)
  WHERE suspended_until IS NOT NULL;

-- ── Auto-expire stale records (cleanup) ────────────────────────
-- Rows older than 24 hours with no active suspension are pruned
-- by the pg_cron extension or a periodic Edge Function cleanup job.
-- For now, a simple index supports manual cleanup:
CREATE INDEX IF NOT EXISTS idx_login_tracker_updated
  ON public.login_attempts_tracker (updated_at);

-- ── Row-level security ─────────────────────────────────────────
ALTER TABLE public.login_attempts_tracker ENABLE ROW LEVEL SECURITY;

-- Only the service_role (Edge Functions) may read/write this table.
-- No direct client access is permitted.
CREATE POLICY "service_role_all"
  ON public.login_attempts_tracker
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── Server-side upsert + tier calculator ───────────────────────
-- Called by the Edge Function on every login attempt.
-- Returns the current state so the decision can be made server-side.
CREATE OR REPLACE FUNCTION public.handle_login_attempt(
  p_email        text,
  p_identifier   text,
  p_ip           inet,
  p_fingerprint  text,
  p_success      boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_record         record;
  v_new_failures   integer;
  v_new_tier       integer;
  v_suspended_until timestamptz;
  v_lockout_min    integer;
BEGIN
  -- Look up existing tracker for this email + device vector
  SELECT * INTO v_record
  FROM public.login_attempts_tracker
  WHERE email = lower(trim(p_email))
    AND identifier_hash = p_identifier;

  -- If no record exists, create one
  IF NOT FOUND THEN
    IF p_success THEN
      RETURN json_build_object(
        'locked', false,
        'retry_after_ms', 0,
        'tier', 0,
        'message', 'ok'
      );
    END IF;

    v_new_failures := 1;
    v_new_tier := 0;  -- Not locked yet
    v_suspended_until := NULL;

    INSERT INTO public.login_attempts_tracker
      (identifier_hash, email, consecutive_failures, lockout_tier,
       suspended_until, last_ip, last_fingerprint, updated_at)
    VALUES
      (p_identifier, lower(trim(p_email)), 1, 0,
       NULL, p_ip, p_fingerprint, now());

    RETURN json_build_object(
      'locked', false,
      'retry_after_ms', 0,
      'tier', 0,
      'message', 'ok'
    );
  END IF;

  -- ── Success path: reset everything ──────────────────────────
  IF p_success THEN
    UPDATE public.login_attempts_tracker
    SET consecutive_failures = 0,
        lockout_tier = 0,
        suspended_until = NULL,
        last_ip = p_ip,
        last_fingerprint = p_fingerprint,
        updated_at = now()
    WHERE id = v_record.id;

    RETURN json_build_object(
      'locked', false,
      'retry_after_ms', 0,
      'tier', 0,
      'message', 'ok'
    );
  END IF;

  -- ── Check if currently suspended ────────────────────────────
  IF v_record.suspended_until IS NOT NULL AND v_record.suspended_until > now() THEN
    RETURN json_build_object(
      'locked', true,
      'retry_after_ms', EXTRACT(EPOCH FROM (v_record.suspended_until - now())) * 1000,
      'tier', v_record.lockout_tier,
      'message', 'Account suspended. Try again later.'
    );
  END IF;

  -- Suspension expired → reset the window
  IF v_record.suspended_until IS NOT NULL AND v_record.suspended_until <= now() THEN
    v_new_failures := 1;
    v_new_tier := 0;
    v_suspended_until := NULL;
  ELSE
    v_new_failures := v_record.consecutive_failures + 1;
    v_new_tier := v_record.lockout_tier;
    v_suspended_until := v_record.suspended_until;
  END IF;

  -- ── Determine if this failure crosses a tier threshold ──────
  -- Failure thresholds: 3 → T1, 6 → T2, 9 → T3, 12 → T4, 15 → T5 (permanent ban)
  IF v_new_failures > 0 AND v_new_failures % 3 = 0 THEN
    v_new_tier := v_new_tier + 1;
    v_lockout_min := get_lockout_duration_minutes(v_new_tier);
    v_suspended_until := now() + (v_lockout_min || ' minutes')::interval;
  END IF;

  -- Tier 5 (15+ failures): also trigger on every failure beyond 15 to keep it locked
  IF v_new_failures >= 15 AND v_new_tier < 5 THEN
    v_new_tier := 5;
    v_lockout_min := get_lockout_duration_minutes(5);
    v_suspended_until := now() + (v_lockout_min || ' minutes')::interval;
  END IF;

  -- ── Update the tracker record ───────────────────────────────
  UPDATE public.login_attempts_tracker
  SET consecutive_failures = v_new_failures,
      lockout_tier = v_new_tier,
      suspended_until = v_suspended_until,
      last_ip = p_ip,
      last_fingerprint = p_fingerprint,
      updated_at = now()
  WHERE id = v_record.id;

  -- ── If now suspended, tell the client how long ──────────────
  IF v_suspended_until IS NOT NULL AND v_suspended_until > now() THEN
    RETURN json_build_object(
      'locked', true,
      'retry_after_ms', EXTRACT(EPOCH FROM (v_suspended_until - now())) * 1000,
      'tier', v_new_tier,
      'message', 'Account suspended. Try again later.'
    );
  END IF;

  RETURN json_build_object(
    'locked', false,
    'retry_after_ms', 0,
    'tier', v_new_tier,
    'message', 'ok'
  );
END;
$$;

-- ── Admin-only: reset a user's tracker (for manual unlocks) ──
CREATE OR REPLACE FUNCTION public.admin_reset_login_tracker(
  p_email text,
  p_identifier text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM public.login_attempts_tracker
  WHERE email = lower(trim(p_email))
    AND (p_identifier IS NULL OR identifier_hash = p_identifier);
$$;

-- ── Cleanup: purge records older than 24h with no active lock ──
CREATE OR REPLACE FUNCTION public.cleanup_expired_login_trackers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.login_attempts_tracker
  WHERE updated_at < now() - interval '24 hours'
    AND (suspended_until IS NULL OR suspended_until < now());

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
