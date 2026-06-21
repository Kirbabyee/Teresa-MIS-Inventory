-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Automated Inventory Audit Log Erasure Engine
-- Created: 2026-06-21
--
-- This migration:
--   1. Seeds inventory erasure config keys into system_configurations
--   2. Deploys purge_all_inventory_audit_logs() with dynamic table discovery
--   3. Schedules daily midnight cron job via pg_cron
--
-- Architecture:
--   - Hardcoded table: inventory_change_logs (computer lab dashboard)
--   - Dynamic tables:  inventory_{tab_name}_logs (per-tab audit trail)
--   - Both use `change_ts` timestamp column (NOT created_at)
--   - The function discovers all matching tables in public schema and purges
--     rows where change_ts < now() - retention_days
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Seed Inventory Erasure Configuration ─────────────────────────────────
--
-- These keys are read by purge_all_inventory_audit_logs() at runtime.
-- Defaults: enabled = false (opt-in), days = 60.
-- The admin toggles these via the SystemSettings page; the cron job picks
-- up the new values on the next run automatically.

INSERT INTO public.system_configurations (key, value, updated_at)
VALUES
  ('inventory_erasure_enabled', 'false', now()),
  ('inventory_erasure_days',    '60',    now())
ON CONFLICT (key) DO NOTHING;


-- ── 2. PL/pgSQL Dynamic Discovery + Purge Function ──────────────────────────
--
-- purge_all_inventory_audit_logs()
--
--   • Reads activation flag AND retention days dynamically from
--     public.system_configurations every invocation.
--   • If inventory_erasure_enabled != 'true' → exits immediately.
--   • Computes cutoff = now() - (configured_days || ' days')::interval.
--   • Discovers every log table in the public schema:
--       1. The hardcoded inventory_change_logs table
--       2. Every table whose name starts with 'inventory_' AND ends in '_logs'
--          (dynamic per-tab tables like inventory_computing_devices_logs)
--   • Explicitly excludes export_logs and dynamic_inventory_export_logs
--     (those are managed by the separate export erasure function).
--   • Uses `change_ts` column for the timestamp comparison (the actual column
--     name used by both inventory_change_logs and all dynamic *_logs tables).
--   • Returns a text summary of rows purged per table (visible in all clients).
--
-- SECURITY DEFINER: runs as table owner so the function can write to any
-- log table regardless of the invoker's RLS policies.

CREATE OR REPLACE FUNCTION public.purge_all_inventory_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_enabled       text;
  v_days          text;
  v_cutoff        timestamptz;
  v_table_name    text;
  v_ts_column     text;
  v_deleted       integer;
  v_total_deleted integer := 0;
  v_tables_purged integer := 0;
BEGIN
  -- ── Activation gate ────────────────────────────────────────────────────
  SELECT value
    INTO v_enabled
    FROM public.system_configurations
   WHERE key = 'inventory_erasure_enabled';

  IF v_enabled IS DISTINCT FROM 'true' THEN
    RAISE NOTICE '[inventory_audit_purge] Erasure disabled — skipping.';
    RETURN;
  END IF;

  -- ── Retention threshold ────────────────────────────────────────────────
  SELECT value
    INTO v_days
    FROM public.system_configurations
   WHERE key = 'inventory_erasure_days';

  IF v_days IS NULL OR v_days = '' THEN
    v_days := '60';
  END IF;

  v_cutoff := now() - (v_days || ' days')::interval;
  RAISE NOTICE '[inventory_audit_purge] Cutoff threshold: %', v_cutoff;

  -- ── Dynamic table discovery + purge loop ──────────────────────────────
  -- Cursor over every candidate log table in the public schema.
  -- Includes:
  --   1. The hardcoded inventory_change_logs table
  --   2. Every table whose name starts with 'inventory_' AND ends in '_logs'
  -- Explicitly excludes:
  --   - export_logs (managed by purge_expired_export_files)
  --   - dynamic_inventory_export_logs (managed by purge_expired_export_files)
  --   - system_configurations (not a log table)
  --
  -- Timestamp column priority: change_ts (standard for all inventory log tables),
  -- then created_at (fallback for any custom tables that might use it).

  FOR v_table_name IN
    SELECT t.table_name
      FROM information_schema.tables t
     WHERE t.table_schema = 'public'
       AND t.table_type   = 'BASE TABLE'
       AND (
                t.table_name = 'inventory_change_logs'
             OR (
                  t.table_name LIKE 'inventory\_%\_logs' ESCAPE '\'
                )
           )
       AND t.table_name NOT IN ('export_logs', 'dynamic_inventory_export_logs', 'system_configurations')
     ORDER BY t.table_name
  LOOP
    -- Determine which timestamp column this table uses.
    -- Priority: change_ts (standard for all inventory log tables), then created_at.
    SELECT column_name INTO v_ts_column
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name   = v_table_name
       AND c.column_name  IN ('change_ts', 'created_at')
     ORDER BY CASE c.column_name
                WHEN 'change_ts' THEN 1
                WHEN 'created_at' THEN 2
                ELSE 3
              END
     LIMIT 1;

    IF v_ts_column IS NULL THEN
      RAISE NOTICE '[inventory_audit_purge] Skipping % — no change_ts or created_at column.', v_table_name;
      CONTINUE;
    END IF;

    -- Execute the dynamic purge using the discovered timestamp column
    EXECUTE format(
      'DELETE FROM %I WHERE %I < $1',
      v_table_name,
      v_ts_column
    ) USING v_cutoff;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total_deleted := v_total_deleted + v_deleted;
    v_tables_purged := v_tables_purged + 1;
    RAISE NOTICE '[inventory_audit_purge] Purged % rows from % (using %).', v_deleted, v_table_name, v_ts_column;
  END LOOP;

  RAISE NOTICE '[inventory_audit_purge] Done. % total rows purged across % tables.', v_total_deleted, v_tables_purged;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.purge_all_inventory_audit_logs() TO service_role;


-- ── 3. Cron Job Registration ──────────────────────────────────────────────
--
-- Schedules the inventory audit purge function once daily at midnight (UTC).
-- cron.schedule() is idempotent — if a job with the same name already exists,
-- it is replaced with the new definition.

-- Delete existing job by ID if present, then schedule fresh.
-- cron.schedule() would also replace by name, but we also clean up stale
-- entries (e.g. job 36 from a prior failed attempt) first.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'purge-inventory-audit-logs-daily'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'purge-inventory-audit-logs-daily',
  '0 0 * * *',                                      -- midnight UTC daily
  'SELECT public.purge_all_inventory_audit_logs()'
);
