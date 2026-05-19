-- Migration: schedule 30-day cleanup for export_logs
-- Created: 2026-05-19

CREATE EXTENSION IF NOT EXISTS "pg_cron";

CREATE OR REPLACE FUNCTION public.cleanup_export_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'export-logs'
    AND created_at < (now() - INTERVAL '30 days');

  DELETE FROM public.export_logs
  WHERE created_at < (now() - INTERVAL '30 days');
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('cleanup-export-logs-daily');
  EXCEPTION
    WHEN others THEN
    NULL;
  END;
END
$$;

SELECT cron.schedule(
  'cleanup-export-logs-daily',
  '0 3 * * *',
  $$SELECT public.cleanup_export_logs();$$
);
