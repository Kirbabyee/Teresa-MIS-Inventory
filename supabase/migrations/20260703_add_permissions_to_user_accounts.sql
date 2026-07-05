BEGIN;

-- Add permissions column to user_accounts table
-- This column stores role-based access control settings as JSON
ALTER TABLE IF EXISTS public.user_accounts
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb;

-- Update existing rows to have an empty permissions object
UPDATE public.user_accounts
SET permissions = '{}'::jsonb
WHERE permissions IS NULL;

COMMENT ON COLUMN public.user_accounts.permissions IS 'Role-based access control settings for borrowing system and other features. Format: {"allowPendingApprovals": boolean, ...}';

COMMIT;