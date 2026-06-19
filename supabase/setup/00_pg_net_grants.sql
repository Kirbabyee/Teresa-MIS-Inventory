-- ══════════════════════════════════════════════════════════════════════════════
-- GRANT: Enable pg_net Edge Function calls from pg_cron
-- ══════════════════════════════════════════════════════════════════════════════
--
-- PURPOSE:
--   Set GUC parameters so pg_cron (and all other sessions) can read the
--   Supabase URL and anon key needed by purge_expired_storage_files().
--
-- IMPORTANT:
--   ALTER DATABASE works inside Supabase SQL Editor (unlike ALTER SYSTEM).
--   Run this as a single batch.
--
-- ══════════════════════════════════════════════════════════════════════════════

ALTER DATABASE postgres SET supabase_functions.url = 'https://yzhgvvnchajslpcabrjn.supabase.co';
ALTER DATABASE postgres SET supabase_functions.key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6aGd2dm5jaGFqc2xwY2FicmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNjE5MzUsImV4cCI6MjA5MjgzNzkzNX0.Kgtzj6TG45WXfRP-0RSYa0UA7ZpkdIDPZ5EuyxMU39Q';
