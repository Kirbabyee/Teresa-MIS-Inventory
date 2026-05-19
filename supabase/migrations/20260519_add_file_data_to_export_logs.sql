-- Migration: add workbook payload to export_logs for downloadable file entries
-- Created: 2026-05-19

ALTER TABLE public.export_logs
ADD COLUMN IF NOT EXISTS file_data text;
