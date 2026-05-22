BEGIN;

ALTER TABLE IF EXISTS public.user_accounts
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.user_accounts
SET is_active = true
WHERE is_active IS NULL;

COMMENT ON COLUMN public.user_accounts.is_active IS 'Marks whether the account can log in. Inactive accounts are blocked from authentication in the app.';

COMMIT;
