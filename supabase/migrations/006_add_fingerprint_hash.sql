-- ═══════════════════════════════════════════════════════════════════
-- Migration 006: Add fingerprint_hash column to login_attempts_tracker
-- Enables device-level lockout checks that survive VPN/IP switching.
-- ═══════════════════════════════════════════════════════════════════

-- Enable pgcrypto for SHA-256 hashing (required by the RPC)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Update tier config to include Tier 5 (permanent ban — year 9999 suspension)
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
    ELSE 525600  -- Tier 5 → 365 days (fallback, but RPC uses '9999-12-31' directly)
  END;
$$;

-- Add fingerprint_hash column
ALTER TABLE public.login_attempts_tracker
  ADD COLUMN IF NOT EXISTS fingerprint_hash text NOT NULL DEFAULT '';

-- Index for fingerprint-based lookups
CREATE INDEX IF NOT EXISTS idx_login_tracker_fingerprint
  ON public.login_attempts_tracker (fingerprint_hash)
  WHERE suspended_until IS NOT NULL;

-- Update the RPC to store fingerprint_hash on insert and update
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
  v_fp_hash        text;
BEGIN
  -- Compute SHA-256 hash of the raw fingerprint string
  v_fp_hash := encode(digest(p_fingerprint, 'sha256'), 'hex');

  -- Look up existing tracker for this email + device vector
  SELECT * INTO v_record
  FROM public.login_attempts_tracker
  WHERE email = lower(trim(p_email))
    AND identifier_hash = p_identifier;

  -- If no record exists, create one
  IF NOT FOUND THEN
    IF p_success THEN
      RETURN json_build_object('locked', false, 'retry_after_ms', 0, 'tier', 0, 'message', 'ok');
    END IF;

    v_new_failures := 1;
    v_new_tier := 0;
    v_suspended_until := NULL;

    INSERT INTO public.login_attempts_tracker
      (identifier_hash, email, consecutive_failures, lockout_tier,
       suspended_until, last_ip, last_fingerprint, fingerprint_hash, updated_at)
    VALUES
      (p_identifier, lower(trim(p_email)), 1, 0,
       NULL, p_ip, p_fingerprint, v_fp_hash, now());

    RETURN json_build_object('locked', false, 'retry_after_ms', 0, 'tier', 0, 'message', 'ok');
  END IF;

  -- Success path: reset everything
  IF p_success THEN
    UPDATE public.login_attempts_tracker
    SET consecutive_failures = 0, lockout_tier = 0, suspended_until = NULL,
        last_ip = p_ip, last_fingerprint = p_fingerprint, fingerprint_hash = v_fp_hash,
        updated_at = now()
    WHERE id = v_record.id;

    RETURN json_build_object('locked', false, 'retry_after_ms', 0, 'tier', 0, 'message', 'ok');
  END IF;

  -- Check if currently suspended
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

  -- Every 3 failures escalate a tier: 3→T1, 6→T2, 9→T3, 12→T4
  IF v_new_failures > 0 AND v_new_failures % 3 = 0 THEN
    v_new_tier := v_new_tier + 1;
    v_lockout_min := get_lockout_duration_minutes(v_new_tier);
    v_suspended_until := now() + (v_lockout_min || ' minutes')::interval;
  END IF;

  -- Tier 5 (15+ failures): permanent ban — suspend until year 9999
  IF v_new_failures >= 15 AND v_new_tier < 5 THEN
    v_new_tier := 5;
    v_suspended_until := '9999-12-31 23:59:59'::timestamptz;
  END IF;

  -- Update the tracker record
  UPDATE public.login_attempts_tracker
  SET consecutive_failures = v_new_failures, lockout_tier = v_new_tier,
      suspended_until = v_suspended_until,
      last_ip = p_ip, last_fingerprint = p_fingerprint, fingerprint_hash = v_fp_hash,
      updated_at = now()
  WHERE id = v_record.id;

  -- If now suspended, tell the client how long
  IF v_suspended_until IS NOT NULL AND v_suspended_until > now() THEN
    RETURN json_build_object(
      'locked', true,
      'retry_after_ms', EXTRACT(EPOCH FROM (v_suspended_until - now())) * 1000,
      'tier', v_new_tier,
      'message', 'Account suspended. Try again later.'
    );
  END IF;

  RETURN json_build_object('locked', false, 'retry_after_ms', 0, 'tier', v_new_tier, 'message', 'ok');
END;
$$;
