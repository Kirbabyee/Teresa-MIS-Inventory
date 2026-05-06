-- Migration: Update inventory_change_logs to store email instead of uuid
-- Created: 2026-05-06

-- Alter the changed_by column to store text (email) instead of uuid
ALTER TABLE public.inventory_change_logs 
ALTER COLUMN changed_by TYPE text USING changed_by::text;

-- Update the trigger function to extract and store email from JWT
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
  -- try to extract the user email or id from Supabase JWT claims
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
