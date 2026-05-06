-- Migration: create inventory_change_logs table and trigger for computers_components
-- Created: 2026-05-06

-- Ensure pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Audit table for inventory/component changes
CREATE TABLE IF NOT EXISTS public.inventory_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_ts timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  table_name text NOT NULL,
  record_id jsonb,
  lab_number_id uuid,
  computer_number integer,
  component_type text,
  old_data jsonb,
  new_data jsonb,
  changed_by text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Indexes to support queries
CREATE INDEX IF NOT EXISTS idx_inventory_change_logs_change_ts ON public.inventory_change_logs (change_ts DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_change_logs_lab_number ON public.inventory_change_logs (lab_number_id);
CREATE INDEX IF NOT EXISTS idx_inventory_change_logs_computer_number ON public.inventory_change_logs (computer_number);
CREATE INDEX IF NOT EXISTS idx_inventory_change_logs_component_type ON public.inventory_change_logs (component_type);
CREATE INDEX IF NOT EXISTS idx_inventory_change_logs_gin_old ON public.inventory_change_logs USING gin (old_data);
CREATE INDEX IF NOT EXISTS idx_inventory_change_logs_gin_new ON public.inventory_change_logs USING gin (new_data);

-- Trigger function to record changes on computers_components
CREATE OR REPLACE FUNCTION public.log_computers_components_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claims_text text;
  v_user text := NULL;
  v_record jsonb;
BEGIN
  -- try to extract the acting user id from Supabase JWT claims
  v_claims_text := current_setting('request.jwt.claims', true);
  IF v_claims_text IS NOT NULL AND v_claims_text <> '' THEN
    BEGIN
      v_user := v_claims_text::json ->> 'email';
      IF v_user IS NULL OR v_user = '' THEN
        v_user := v_claims_text::json ->> 'sub';
      END IF;
    EXCEPTION WHEN others THEN
      v_user := NULL;
    END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_record := jsonb_build_object(
      'computer_number', NEW.computer_number,
      'type', NEW.type,
      'id', COALESCE(NEW.id, NULL)
    );

    INSERT INTO public.inventory_change_logs(
      action, table_name, record_id, lab_number_id, computer_number, component_type, old_data, new_data, changed_by, metadata
    ) VALUES (
      'INSERT', TG_TABLE_NAME, v_record, NEW.lab_number_id, NEW.computer_number, NEW.type, NULL, to_jsonb(NEW), v_user, jsonb_build_object('source','trigger','op',TG_OP)
    );

    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_record := jsonb_build_object(
      'computer_number', COALESCE(NEW.computer_number, OLD.computer_number),
      'type', COALESCE(NEW.type, OLD.type),
      'id', COALESCE(NEW.id, OLD.id, NULL)
    );

    INSERT INTO public.inventory_change_logs(
      action, table_name, record_id, lab_number_id, computer_number, component_type, old_data, new_data, changed_by, metadata
    ) VALUES (
      'UPDATE', TG_TABLE_NAME, v_record, NEW.lab_number_id, NEW.computer_number, NEW.type, to_jsonb(OLD), to_jsonb(NEW), v_user, jsonb_build_object('source','trigger','op',TG_OP)
    );

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_record := jsonb_build_object(
      'computer_number', OLD.computer_number,
      'type', OLD.type,
      'id', COALESCE(OLD.id, NULL)
    );

    INSERT INTO public.inventory_change_logs(
      action, table_name, record_id, lab_number_id, computer_number, component_type, old_data, new_data, changed_by, metadata
    ) VALUES (
      'DELETE', TG_TABLE_NAME, v_record, OLD.lab_number_id, OLD.computer_number, OLD.type, to_jsonb(OLD), NULL, v_user, jsonb_build_object('source','trigger','op',TG_OP)
    );

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- Attach trigger to computers_components
DROP TRIGGER IF EXISTS trg_computers_components_audit ON public.computers_components;
CREATE TRIGGER trg_computers_components_audit
AFTER INSERT OR UPDATE OR DELETE ON public.computers_components
FOR EACH ROW
EXECUTE FUNCTION public.log_computers_components_changes();

-- Optional: note about retention/partitioning
-- Consider adding a retention policy or partitioning for very large audit volumes.
