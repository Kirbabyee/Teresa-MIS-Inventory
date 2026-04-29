create extension if not exists pgcrypto;

drop table if exists public.inventory_items cascade;
drop table if exists public.inventory_sections cascade;
drop table if exists public.inventory_tabs cascade;

create table if not exists public.inventory_tabs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_sections (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.inventory_tabs(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tab_id, slug)
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.inventory_sections(id) on delete cascade,
  computer_number integer not null,
  type text not null,
  brand text not null default '',
  description text not null default '',
  status text not null default '',
  data jsonb default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id, computer_number, type)
);

create index if not exists inventory_tabs_sort_order_idx
  on public.inventory_tabs(sort_order);

create index if not exists inventory_sections_tab_id_idx
  on public.inventory_sections(tab_id);

create index if not exists inventory_sections_sort_order_idx
  on public.inventory_sections(sort_order);

create index if not exists inventory_items_section_id_idx
  on public.inventory_items(section_id);

create index if not exists inventory_items_computer_number_idx
  on public.inventory_items(computer_number);

create index if not exists inventory_items_type_idx
  on public.inventory_items(type);

-- simple key/value settings for inventory feature (stores endpoint URLs and other admin config)
create table if not exists public.inventory_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists inventory_tabs_updated_at on public.inventory_tabs;
create trigger inventory_tabs_updated_at
before update on public.inventory_tabs
for each row execute function public.set_updated_at();

drop trigger if exists inventory_sections_updated_at on public.inventory_sections;
create trigger inventory_sections_updated_at
before update on public.inventory_sections
for each row execute function public.set_updated_at();

drop trigger if exists inventory_items_updated_at on public.inventory_items;
create trigger inventory_items_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

alter table public.inventory_tabs disable row level security;
alter table public.inventory_sections disable row level security;
alter table public.inventory_items disable row level security;
alter table public.inventory_settings disable row level security;

-- Ensure no RLS policies remain on inventory_settings
drop policy if exists "inventory_settings_read_all" on public.inventory_settings;
drop policy if exists "inventory_settings_write_all" on public.inventory_settings;
drop policy if exists "inventory_settings_delete_all" on public.inventory_settings;

insert into public.inventory_tabs (name, slug, description, sort_order)
values ('Laboratory', 'laboratory', 'Laboratory inventory tabs and sections.', 1)
on conflict (slug) do nothing;

do $$
declare
  laboratory_tab_id uuid;
begin
  select id into laboratory_tab_id
  from public.inventory_tabs
  where slug = 'laboratory'
  limit 1;

  if laboratory_tab_id is not null then
    insert into public.inventory_sections (tab_id, name, slug, description, sort_order)
    values
      (laboratory_tab_id, 'Laboratory 1', 'laboratory-1', '', 1),
      (laboratory_tab_id, 'Laboratory 2', 'laboratory-2', '', 2),
      (laboratory_tab_id, 'Laboratory 3', 'laboratory-3', '', 3),
      (laboratory_tab_id, 'Laboratory 4', 'laboratory-4', '', 4),
      (laboratory_tab_id, 'Laboratory 5', 'laboratory-5', '', 5)
    on conflict (tab_id, slug) do nothing;
  end if;
end $$;