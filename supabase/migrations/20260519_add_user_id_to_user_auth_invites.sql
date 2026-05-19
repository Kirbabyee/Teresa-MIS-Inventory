-- Add `user_id` to user_auth_invites and backfill from employees.auth_id
BEGIN;

ALTER TABLE IF EXISTS public.user_auth_invites
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- Backfill `user_id` from existing data.
-- Some deployments do not have an `employees` table and instead use `user_accounts`.
-- 1) If `employee_id` actually stores a `user_accounts.id`, copy it to `user_id`.
UPDATE public.user_auth_invites uai
SET user_id = uai.employee_id
FROM public.user_accounts ua
WHERE uai.employee_id = ua.id
  AND uai.user_id IS NULL;

-- 2) For invites without a user_id yet, try to match by email (case-insensitive).
UPDATE public.user_auth_invites uai
SET user_id = ua.id
FROM public.user_accounts ua
WHERE uai.email IS NOT NULL
  AND ua.email IS NOT NULL
  AND lower(uai.email) = lower(ua.email)
  AND uai.user_id IS NULL;

-- Index for lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_auth_invites_user_id ON public.user_auth_invites(user_id);

-- Try to add a FK constraint, but don't fail the migration if related rows are missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_auth_invites_user_id'
  ) THEN
    BEGIN
      ALTER TABLE public.user_auth_invites
        ADD CONSTRAINT fk_user_auth_invites_user_id FOREIGN KEY (user_id) REFERENCES public.user_accounts(id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping FK creation for user_auth_invites.user_id (possible missing user_accounts rows)';
    END;
  END IF;
END$$;

COMMIT;
