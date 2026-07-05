create table if not exists public.borrower_allowlist (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school_id text not null unique,
  position text not null default 'student',
  year text,
  section text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_borrower_allowlist_school_id
  on public.borrower_allowlist(school_id);

alter table public.borrower_allowlist disable row level security;
