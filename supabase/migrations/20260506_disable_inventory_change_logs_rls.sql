-- Disable RLS on inventory_change_logs so the audit trigger can write and the history view can read rows.
ALTER TABLE public.inventory_change_logs DISABLE ROW LEVEL SECURITY;

-- Remove any accidental user-defined triggers from the log table.
-- inventory_change_logs is append-only and should not use updated_at hooks.
DO $$
DECLARE
	trigger_record record;
BEGIN
	FOR trigger_record IN
		SELECT tgname
		FROM pg_trigger
		WHERE tgrelid = 'public.inventory_change_logs'::regclass
			AND NOT tgisinternal
	LOOP
		EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.inventory_change_logs;', trigger_record.tgname);
	END LOOP;
END
$$;

-- Also remove any accidental updated_at triggers from the component table.
DO $$
DECLARE
	trigger_record record;
BEGIN
	FOR trigger_record IN
		SELECT tgname
		FROM pg_trigger
		WHERE tgrelid = 'public.computers_components'::regclass
			AND NOT tgisinternal
			AND tgname ILIKE '%updated_at%'
	LOOP
		EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.computers_components;', trigger_record.tgname);
	END LOOP;
END
$$;

-- Drop any existing policies on inventory_change_logs if they were added manually.
DROP POLICY IF EXISTS "inventory_change_logs_read_all" ON public.inventory_change_logs;
DROP POLICY IF EXISTS "inventory_change_logs_insert_all" ON public.inventory_change_logs;
DROP POLICY IF EXISTS "inventory_change_logs_update_all" ON public.inventory_change_logs;
DROP POLICY IF EXISTS "inventory_change_logs_delete_all" ON public.inventory_change_logs;

-- Keep the history view accessible to authenticated users.
GRANT SELECT ON public.inventory_change_logs TO authenticated;