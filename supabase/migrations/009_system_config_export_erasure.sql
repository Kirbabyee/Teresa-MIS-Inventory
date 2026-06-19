-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: System Configuration Table + Dynamic Export File Erasure Engine
-- Created: 2026-06-18
--
-- This migration:
--   1. Creates the system_configurations settings table
--   2. Seeds default export erasure parameters (enabled=true, days=180)
--   3. Deploys purge_expired_export_files() — DB log cleanup (SECURITY DEFINER)
--   4. Schedules DB cleanup as a daily midnight cron job via pg_cron
--   5. Schedules Edge Function invocation (storage cleanup) via pg_cron + pg_net
--
-- The Edge Function (cleanup-export-logs) reads config from
-- system_configurations, deletes old DB rows AND storage files.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Extensions ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ── 1. System Configuration Table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.system_configurations (
  key   text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_configurations DISABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.system_configurations TO authenticated, anon;
GRANT INSERT, UPDATE ON public.system_configurations TO authenticated;


-- ── 2. Seed Default Export Erasure Configuration ───────────────────────────

INSERT INTO public.system_configurations (key, value, updated_at)
VALUES
  ('export_erasure_enabled', 'true',  now()),
  ('export_erasure_days',    '180',  now())
ON CONFLICT (key) DO NOTHING;


-- ── 3. Database Log Cleanup Function ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.purge_expired_export_files()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_enabled    text;
  v_days       text;
  v_cutoff     timestamptz;
BEGIN
  SELECT value INTO v_enabled
    FROM public.system_configurations
   WHERE key = 'export_erasure_enabled';

  IF v_enabled IS DISTINCT FROM 'true' THEN
    RETURN;
  END IF;

  SELECT value INTO v_days
    FROM public.system_configurations
   WHERE key = 'export_erasure_days';

  IF v_days IS NULL OR v_days = '' THEN
    v_days := '180';
  END IF;

  v_cutoff := now() - (v_days || ' days')::interval;

  DELETE FROM public.export_logs           WHERE created_at < v_cutoff;
  DELETE FROM public.dynamic_inventory_export_logs WHERE created_at < v_cutoff;
  DELETE FROM public.inventory_section_exports     WHERE created_at < v_cutoff;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.purge_expired_export_files() TO service_role;


-- ── 4. Cron Job Registration ──────────────────────────────────────────────

-- Job A: Database log cleanup (pure SQL)
SELECT cron.schedule(
  'purge-expired-export-files-daily',
  '0 0 * * *',
  'SELECT public.purge_expired_export_files()'
);

-- Job B: Storage file cleanup (calls cleanup-export-logs Edge Function via pg_net)
-- pg_net v0.20.0: http_post(url, body jsonb, params jsonb, headers jsonb, timeout_milliseconds)
-- cron.schedule runs plain SQL, so use SELECT (not PL/pgSQL PERFORM).
SELECT cron.schedule(
  'invoke-cleanup-export-logs-daily',
  '0 0 * * *',
  'SELECT net.http_post('
    '  url     := ''https://yzhgvvnchajslpcabrjn.supabase.co/functions/v1/cleanup-export-logs'','
    '  headers := jsonb_build_object('
    '              ''Content-Type'',  ''application/json'','
    '              ''apikey'',        ''eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6aGd2dm5jaGFqc2xwY2FicmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNjE5MzUsImV4cCI6MjA5MjgzNzkzNX0.Kgtzj6TG45WXfRP-0RSYa0UA7ZpkdIDPZ5EuyxMU39Q'','
    '              ''Authorization'', ''Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6aGd2dm5jaGFqc2xwY2FicmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNjE5MzUsImV4cCI6MjA5MjgzNzkzNX0.Kgtzj6TG45WXfRP-0RSYa0UA7ZpkdIDPZ5EuyxMU39Q'''
    '            ),'
    '  body    := jsonb_build_object(''job_triggered'', true),'
    '  timeout_milliseconds := 30000'
    ')'
);
