-- Clear the Supabase Security Advisor ERROR findings on public views (30 Oct 2026):
--   * auth_users_exposed: user_emails and v_tenant_owner exposed auth.users to anon/authenticated
--     through PostgREST.
--   * security_definer_view: these views ran with the creator's privileges, bypassing the
--     reader's RLS.
--
-- Every one of these views is read only by server code through the service-role client
-- (createAdminClient): admin tenants page, exemptions API, reporting engine, ingest canary.
-- service_role bypasses RLS and keeps its grants, so the app is unaffected. Browser and
-- logged-in (anon / authenticated) access is removed.
--
-- Revert a single view with: GRANT SELECT ON public.<view> TO authenticated;

DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'user_emails',
    'v_tenant_owner',
    'v_booking_extension_revenue',
    'tenant_billing_overview',
    'analytics_daily_occupancy_v',
    'exemptions_live',
    'v_analytics_daily_occupancy',
    'vwb_backfill_staging_norm',
    'v_booking_reporting',
    'ingest_canary_health'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v AND c.relkind = 'v'
    ) THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v);
    END IF;
  END LOOP;
END $$;
