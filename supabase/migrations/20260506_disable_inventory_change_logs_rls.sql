-- Disable RLS on inventory_change_logs so the audit trigger can write and the history view can read rows.
ALTER TABLE public.inventory_change_logs DISABLE ROW LEVEL SECURITY;

-- Drop any existing policies on inventory_change_logs if they were added manually.
DROP POLICY IF EXISTS "inventory_change_logs_read_all" ON public.inventory_change_logs;
DROP POLICY IF EXISTS "inventory_change_logs_insert_all" ON public.inventory_change_logs;
DROP POLICY IF EXISTS "inventory_change_logs_update_all" ON public.inventory_change_logs;
DROP POLICY IF EXISTS "inventory_change_logs_delete_all" ON public.inventory_change_logs;

-- Keep the history view accessible to authenticated users.
GRANT SELECT ON public.inventory_change_logs TO authenticated;