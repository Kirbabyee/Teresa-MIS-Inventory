-- Migration: move export logs from embedded blobs to Supabase Storage
-- Created: 2026-05-19

ALTER TABLE public.export_logs
ADD COLUMN IF NOT EXISTS file_path text;

ALTER TABLE public.export_logs
DROP COLUMN IF EXISTS file_data;
