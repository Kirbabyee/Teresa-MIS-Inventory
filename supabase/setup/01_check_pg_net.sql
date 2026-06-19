-- ══════════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC: Check what networking extensions are available
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Is pg_net installed?
SELECT extname, extversion
  FROM pg_extension
 WHERE extname IN ('pg_net', 'pg_cron', 'dblink', 'http')
 ORDER BY extname;

-- 2. What extensions are available to install?
SELECT name, comment
  FROM pg_available_extensions
 WHERE name IN ('pg_net', 'http', 'dblink')
 ORDER BY name;

-- 3. Try creating pg_net (will fail gracefully if not available)
DO $test$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
  RAISE NOTICE 'pg_net installed successfully';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'pg_net NOT available: %', SQLERRM;
END
$test$;

-- 4. Check if it worked after the DO block
SELECT extname, extversion
  FROM pg_extension
 WHERE extname = 'pg_net';
