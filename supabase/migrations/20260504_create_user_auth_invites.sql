-- Create user_auth_invites table for account activation tokens
CREATE TABLE IF NOT EXISTS public.user_auth_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  email TEXT NOT NULL,
  invite_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT valid_email CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- Create indexes for common queries
CREATE INDEX idx_user_auth_invites_token_hash ON public.user_auth_invites(invite_token_hash);
CREATE INDEX idx_user_auth_invites_email ON public.user_auth_invites(email);
CREATE INDEX idx_user_auth_invites_employee_id ON public.user_auth_invites(employee_id);

-- Disable RLS for now (enable if needed for security)
ALTER TABLE public.user_auth_invites DISABLE ROW LEVEL SECURITY;
