-- Migration: create dynamic_inventory_export_logs shared table

CREATE TABLE IF NOT EXISTS public.dynamic_inventory_export_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tab_id uuid NULL,
  inventory_uuid uuid NULL,
  table_name text NULL,
  exported_by text NOT NULL,
  file_name text NOT NULL,
  export_date date NOT NULL,
  file_path text NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dynamic_inventory_export_logs_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_dynamic_inventory_export_logs_created_at ON public.dynamic_inventory_export_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dynamic_inventory_export_logs_export_date ON public.dynamic_inventory_export_logs USING btree (export_date DESC);
CREATE INDEX IF NOT EXISTS idx_dynamic_inventory_export_logs_tab_id ON public.dynamic_inventory_export_logs USING btree (tab_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_inventory_export_logs_inventory_uuid ON public.dynamic_inventory_export_logs USING btree (inventory_uuid);
