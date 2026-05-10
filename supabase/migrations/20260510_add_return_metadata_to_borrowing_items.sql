alter table public.borrowing_items
  add column if not exists return_condition text check (return_condition in ('working', 'defective')) default 'working';

alter table public.borrowing_items
  add column if not exists return_remarks text;
