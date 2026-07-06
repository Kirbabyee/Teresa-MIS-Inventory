alter table public.borrower_allowlist
  add column if not exists is_active boolean not null default true;

update public.borrower_allowlist
set is_active = true
where is_active is null;

comment on column public.borrower_allowlist.is_active is 'Marks whether the borrower can access public borrowing.';