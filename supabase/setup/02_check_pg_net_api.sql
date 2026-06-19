-- ══════════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC: Check pg_net v0.20.0 function signatures
-- ══════════════════════════════════════════════════════════════════════════════

-- List all net.* functions with their argument types
SELECT
  p.proname,
  pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'net'
ORDER BY p.proname;
