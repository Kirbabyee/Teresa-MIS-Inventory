alter table public.borrowing_records
  drop constraint if exists borrowing_records_status_check;

alter table public.borrowing_records
  add constraint borrowing_records_status_check
  check (status in ('borrowed', 'returned', 'not_returned', 'returned_late', 'lost', 'damaged'));
