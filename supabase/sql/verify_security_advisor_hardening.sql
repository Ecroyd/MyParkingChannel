-- Run in Supabase SQL editor after applying
-- 20260811_security_advisor_harden_public.sql
-- Expected: zero rows for each CRITICAL check below.

-- 1) Tables in public still missing RLS
SELECT c.relname AS table_missing_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
  AND c.relname NOT IN ('spatial_ref_sys', 'geography_columns', 'geometry_columns')
ORDER BY 1;

-- 2) Public views/matviews that still reference auth.users and are granted
--    to anon or authenticated
SELECT
  n.nspname || '.' || c.relname AS auth_users_view,
  c.relkind,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
FROM pg_rewrite rw
JOIN pg_depend d ON d.objid = rw.oid AND d.refobjid <> rw.ev_class
JOIN pg_class c ON c.oid = rw.ev_class
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_class ref ON ref.oid = d.refobjid
JOIN pg_namespace refn ON refn.oid = ref.relnamespace
WHERE c.relkind IN ('v', 'm')
  AND n.nspname = 'public'
  AND refn.nspname = 'auth'
  AND ref.relname = 'users'
GROUP BY n.nspname, c.relname, c.relkind, c.oid
ORDER BY 1;

-- 3) Sensitive-column tables missing RLS
SELECT c.relname AS sensitive_table_missing_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns col
    WHERE col.table_schema = 'public'
      AND col.table_name = c.relname
      AND col.column_name ~* '(password|secret|token|api_key|private_key|email|phone|customer_)'
  )
ORDER BY 1;
