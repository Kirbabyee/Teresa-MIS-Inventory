-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Automated Borrowing Log Erasure Engine
-- Created: 2026-06-18
--
-- This migration:
--   1. Seeds borrowing erasure config keys into system_configurations
--   2. Deploys purge_expired_borrowing_logs() with dynamic config reads
--   3. Schedules daily midnight cron job via pg_cron
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Seed Borrowing Erasure Configuration ────────────────────────────────
--
-- These keys are read by purge_expired_borrowing_logs() at runtime.
-- Defaults: enabled = false (opt-in), days = 365 (1 year retention).
-- The admin can change these at any time via the SystemSettings page;
-- the cron job picks up the new values on the next run automatically.

INSERT INTO public.system_configurations (key, value, updated_at)
VALUES
  ('borrowing_erasure_enabled', 'false', now()),
  ('borrowing_erasure_days',    '365',   now())
ON CONFLICT (key) DO NOTHING;


-- ── 2. PL/pgSQL Automation Function ───────────────────────────────────────
--
-- purge_expired_borrowing_logs()
--
--   • Reads activation flag AND retention days dynamically from
--     public.system_configurations every time it executes.
--   • If borrowing_erasure_enabled != 'true' → exits immediately (no-op).
--   • Computes cutoff = now() - (configured_days || ' days')::interval.
--   • Deletes from borrowing_records ONLY where status indicates the
--     transaction is fully resolved (returned, returned_late, lost, damaged)
--     AND the record's created_at is older than the cutoff.
--   • Active records (status = 'borrowed' or 'not_returned') are NEVER
--     deleted, regardless of age.
--   • Cascading delete on borrowing_items is handled by the FK constraint
--     (ON DELETE CASCADE).
--
-- SECURITY DEFINER: runs as table owner so it can write to borrowing_records
-- regardless of the invoker's RLS policies.

CREATE OR REPLACE FUNCTION public.purge_expired_borrowing_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_enabled    text;
  v_days       text;
  v_cutoff     timestamptz;
  v_deleted    int;
BEGIN
  -- ── Activation gate ────────────────────────────────────────────────────
  SELECT value
    INTO v_enabled
    FROM public.system_configurations
   WHERE key = 'borrowing_erasure_enabled';

  -- If the key is missing or explicitly set to anything other than 'true',
  -- bail out silently.
  IF v_enabled IS DISTINCT FROM 'true' THEN
    RETURN;
  END IF;

  -- ── Retention threshold ────────────────────────────────────────────────
  SELECT value
    INTO v_days
    FROM public.system_configurations
   WHERE key = 'borrowing_erasure_days';

  -- Fallback to 365 days if the key is missing or unparseable
  IF v_days IS NULL OR v_days = '' THEN
    v_days := '365';
  END IF;

  -- Compute the cutoff timestamp: anything created before this point is expired
  v_cutoff := now() - (v_days || ' days')::interval;

  -- ── Safe targeted deletion ─────────────────────────────────────────────
  -- ONLY purge records that are in a terminal/completed status.
  -- Active borrowing records (status IN ('borrowed', 'not_returned'))
  -- are NEVER touched, no matter how old they are.
  --
  -- The FK on borrowing_items (borrowing_record_id ON DELETE CASCADE)
  -- automatically removes child rows when a parent record is deleted.

  DELETE FROM public.borrowing_records
   WHERE created_at < v_cutoff
     AND status IN ('returned', 'returned_late', 'lost', 'damaged');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- No logging table cleanup needed here; borrowing_records is the
  -- authoritative source. Child items are cascade-deleted automatically.

END;
$fn$;


-- ── 3. Cron Job Registration ──────────────────────────────────────────────
--
-- Schedules the borrowing purge function once daily at midnight (UTC).
-- Idempotent: unregisters any existing job with this name first.

DO $cron_body$
BEGIN
  BEGIN
    PERFORM cron.unschedule('purge-expired-borrowing-logs-daily');
  EXCEPTION
    WHEN others THEN
      NULL;   -- job didn't exist yet — that's fine
  END;
END
$cron_body$;

SELECT cron.schedule(
  'purge-expired-borrowing-logs-daily',
  '0 0 * * *',                                      -- midnight UTC daily
  $$SELECT public.purge_expired_borrowing_logs();$$
);
