-- Disable RLS on inventory_settings to allow reads/writes from authenticated users
ALTER TABLE public.inventory_settings DISABLE ROW LEVEL SECURITY;

-- Drop any existing RLS policies on inventory_settings (if any exist)
DROP POLICY IF EXISTS "inventory_settings_read_all" ON public.inventory_settings;
DROP POLICY IF EXISTS "inventory_settings_write_all" ON public.inventory_settings;
DROP POLICY IF EXISTS "enable_read_all_for_authenticated_users" ON public.inventory_settings;
DROP POLICY IF EXISTS "enable_insert_for_authenticated_users" ON public.inventory_settings;
DROP POLICY IF EXISTS "enable_update_for_authenticated_users" ON public.inventory_settings;
DROP POLICY IF EXISTS "enable_delete_for_authenticated_users" ON public.inventory_settings;
