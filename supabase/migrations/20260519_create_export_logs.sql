-- Migration: create export_logs table for computer laboratory exports
-- Created: 2026-05-19

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.export_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_by text NOT NULL,
  file_name text NOT NULL,
  export_date date NOT NULL,
  file_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_logs_created_at
  ON public.export_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_logs_export_date
  ON public.export_logs (export_date DESC);

ALTER TABLE public.export_logs DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "export_logs_read_all" ON public.export_logs;
DROP POLICY IF EXISTS "export_logs_insert_all" ON public.export_logs;

GRANT SELECT, INSERT ON public.export_logs TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('export-logs', 'export-logs', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'export_logs_insert_files'
  ) THEN
    CREATE POLICY export_logs_insert_files
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'export-logs');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'export_logs_delete_files'
  ) THEN
    CREATE POLICY export_logs_delete_files
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'export-logs');
  END IF;
END
$$;
