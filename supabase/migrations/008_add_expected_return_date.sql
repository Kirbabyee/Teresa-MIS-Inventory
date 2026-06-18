-- ═══════════════════════════════════════════════════════════════════
-- Migration 008: Add expected_return_at to borrowing_records
-- Allows tracking when items are due back and auto-marking
-- overdue borrows as not_returned.
-- ═══════════════════════════════════════════════════════════════════

alter table public.borrowing_records
  add column if not exists expected_return_at timestamptz;

create index if not exists idx_borrowing_records_expected_return_at
  on public.borrowing_records(expected_return_at);
