-- Migration: create shared export logs and inventory_section_exports tables

-- Shared export logs table (global)
CREATE TABLE IF NOT EXISTS public.export_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  export_by text NOT NULL,
  file_name text NOT NULL,
  export_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  file_data text NULL,
  file_path text NULL,
  metadata jsonb NULL,
  CONSTRAINT export_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_export_logs_created_at ON public.export_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_logs_export_date ON public.export_logs USING btree (export_date DESC);

-- Per-section fallback exports table used by UI components
CREATE TABLE IF NOT EXISTS public.inventory_section_exports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  exported_by text NOT NULL,
  file_name text NOT NULL,
  export_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  file_path text NULL,
  section_id uuid NULL,
  tab_id uuid NULL,
  metadata jsonb NULL,
  CONSTRAINT inventory_section_exports_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_section_exports_created_at ON public.inventory_section_exports USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_section_exports_export_date ON public.inventory_section_exports USING btree (export_date DESC);

-- Example DDL for creating a per-inventory exports table named <table_name>_exports
-- Run manually or via Edge Function when creating a new inventory table.
--
-- CREATE TABLE public.<table_name>_exports (
--   id uuid NOT NULL DEFAULT gen_random_uuid(),
--   exported_by text NOT NULL,
--   file_name text NOT NULL,
--   export_date date NOT NULL,
--   created_at timestamptz NOT NULL DEFAULT now(),
--   file_path text NULL,
--   section_id uuid NULL,
--   tab_id uuid NULL,
--   metadata jsonb NULL,
--   CONSTRAINT <table_name>_exports_pkey PRIMARY KEY (id)
-- );
--
-- CREATE INDEX IF NOT EXISTS idx_<table_name>_exports_created_at ON public.<table_name>_exports USING btree (created_at DESC);
-- CREATE INDEX IF NOT EXISTS idx_<table_name>_exports_export_date ON public.<table_name>_exports USING btree (export_date DESC);
