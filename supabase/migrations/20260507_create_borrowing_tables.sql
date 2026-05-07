create table if not exists public.borrowing_records (
  id uuid primary key default gen_random_uuid(),
  borrower_name text not null,
  borrower_id_number text not null,
  borrower_role text not null,
  borrowed_at timestamptz not null default now(),
  returned_at timestamptz,
  status text not null default 'borrowed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint borrowing_records_status_check
    check (status in ('borrowed', 'returned', 'lost', 'damaged'))
);

create table if not exists public.borrowing_items (
  id uuid primary key default gen_random_uuid(),
  borrowing_record_id uuid not null references public.borrowing_records(id) on delete cascade,
  inventory_item_id uuid not null,
  inventory_tab_id uuid references public.inventory_tabs(id) on delete set null,
  inventory_section_id uuid references public.inventory_sections(id) on delete set null,
  inventory_table_name text,
  item_label text not null,
  item_details jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_borrowing_records_status
  on public.borrowing_records(status);

create index if not exists idx_borrowing_records_borrowed_at
  on public.borrowing_records(borrowed_at desc);

create index if not exists idx_borrowing_items_record_id
  on public.borrowing_items(borrowing_record_id);

create index if not exists idx_borrowing_items_inventory_item_id
  on public.borrowing_items(inventory_item_id);

alter table public.borrowing_records disable row level security;
alter table public.borrowing_items disable row level security;
