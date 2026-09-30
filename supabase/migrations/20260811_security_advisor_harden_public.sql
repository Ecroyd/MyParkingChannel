-- Harden public schema against Supabase Security Advisor CRITICAL findings:
--   - rls_disabled_in_public
--   - auth_users_exposed
--   - sensitive_columns_exposed
--
-- Service-role server code continues to work (bypasses RLS).

-- ---------------------------------------------------------------------------
-- 1) auth_users_exposed
--    Revoke Data API access to any public view/matview over auth.users.
--    Force security_invoker so remaining access cannot bypass privileges.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT
      n.nspname AS schema_name,
      c.relname AS view_name,
      c.relkind
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
  LOOP
    EXECUTE format(
      'REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated',
      r.schema_name,
      r.view_name
    );

    IF r.relkind = 'v' THEN
      BEGIN
        EXECUTE format(
          'ALTER VIEW %I.%I SET (security_invoker = on)',
          r.schema_name,
          r.view_name
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not set security_invoker on %.%: %',
          r.schema_name, r.view_name, SQLERRM;
      END;
    END IF;

    RAISE NOTICE 'Locked down auth.users-backed relation %.%',
      r.schema_name, r.view_name;
  END LOOP;
END $$;

-- Admin UI uses get_user_contact_info via service role — never anon.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_user_contact_info'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid'
  ) THEN
    REVOKE ALL ON FUNCTION public.get_user_contact_info(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_user_contact_info(uuid) TO service_role;
  END IF;
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Helper: enable RLS + revoke anon on a table if it exists
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._pc_enable_rls_lock_anon(p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = p_table
      AND c.relkind = 'r'
  ) THEN
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', p_table);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', p_table);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._pc_enable_rls_lock_anon(text) FROM PUBLIC, anon, authenticated;

-- Platform-only secret stores: service role only (no authenticated policies)
SELECT public._pc_enable_rls_lock_anon('platform_secrets');
SELECT public._pc_enable_rls_lock_anon('email_provider_settings');
SELECT public._pc_enable_rls_lock_anon('platform_integration_settings');
SELECT public._pc_enable_rls_lock_anon('audit_logs');
SELECT public._pc_enable_rls_lock_anon('temp_booking_data');
SELECT public._pc_enable_rls_lock_anon('partner_api_keys');
SELECT public._pc_enable_rls_lock_anon('booking_external_payloads');

-- Force RLS so even table-owner sessions cannot accidentally bypass on these.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_secrets',
    'email_provider_settings',
    'platform_integration_settings',
    'temp_booking_data',
    'partner_api_keys',
    'booking_external_payloads'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

-- tenant_secrets: RLS on; tenant owner/admin may manage their own rows
-- (legacy Stripe settings page still uses the browser client).
SELECT public._pc_enable_rls_lock_anon('tenant_secrets');
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'tenant_secrets' AND c.relkind = 'r'
  ) THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_secrets TO authenticated;

    DROP POLICY IF EXISTS tenant_secrets_admin_all ON public.tenant_secrets;
    CREATE POLICY tenant_secrets_admin_all
      ON public.tenant_secrets
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_tenants ut
          WHERE ut.tenant_id = tenant_secrets.tenant_id
            AND ut.user_id = (SELECT auth.uid())
            AND ut.role IN ('owner', 'admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_tenants ut
          WHERE ut.tenant_id = tenant_secrets.tenant_id
            AND ut.user_id = (SELECT auth.uid())
            AND ut.role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;

-- tenant_invitations: members of the tenant can read; service role writes
SELECT public._pc_enable_rls_lock_anon('tenant_invitations');
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'tenant_invitations' AND c.relkind = 'r'
  ) THEN
    GRANT SELECT ON TABLE public.tenant_invitations TO authenticated;
    DROP POLICY IF EXISTS tenant_invitations_select_member ON public.tenant_invitations;
    CREATE POLICY tenant_invitations_select_member
      ON public.tenant_invitations FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_tenants ut
          WHERE ut.tenant_id = tenant_invitations.tenant_id
            AND ut.user_id = (SELECT auth.uid())
        )
        OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      );
  END IF;
END $$;

-- Catch-all: remaining public tables with sensitive-looking columns + no RLS
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
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
          AND col.column_name ~* '(password|secret|token|api_key|private_key|access_key|refresh_token|ciphertext)'
      )
  LOOP
    PERFORM public._pc_enable_rls_lock_anon(r.table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', r.table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.table_name);
    RAISE NOTICE 'Catch-all RLS enabled on public.%', r.table_name;
  END LOOP;
END $$;

-- Broader PII tables still missing RLS: enable + tenant membership SELECT
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS table_name
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
          AND col.column_name ~* '(customer_email|customer_phone|customer_name|email|phone|plate)'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns col2
        WHERE col2.table_schema = 'public'
          AND col2.table_name = c.relname
          AND col2.column_name = 'tenant_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', r.table_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', r.table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', r.table_name);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      r.table_name || '_select_member',
      r.table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
         EXISTS (
           SELECT 1 FROM public.user_tenants ut
           WHERE ut.tenant_id = %I.tenant_id
             AND ut.user_id = (SELECT auth.uid())
         )
       )',
      r.table_name || '_select_member',
      r.table_name,
      r.table_name
    );

    RAISE NOTICE 'Enabled tenant-scoped RLS on public.%', r.table_name;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Ensure core membership / booking tables have RLS + member SELECT
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.user_tenants') IS NOT NULL THEN
    ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS user_tenants_select_own ON public.user_tenants;
    CREATE POLICY user_tenants_select_own
      ON public.user_tenants FOR SELECT TO authenticated
      USING ((SELECT auth.uid()) = user_id);
  END IF;

  IF to_regclass('public.tenants') IS NOT NULL THEN
    ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenants_select_member ON public.tenants;
    CREATE POLICY tenants_select_member
      ON public.tenants FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_tenants ut
          WHERE ut.tenant_id = tenants.id
            AND ut.user_id = (SELECT auth.uid())
        )
      );
  END IF;

  IF to_regclass('public.bookings') IS NOT NULL THEN
    ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
    -- Close anonymous Data API access; keep existing authenticated grants.
    REVOKE ALL ON TABLE public.bookings FROM PUBLIC, anon;
    GRANT ALL ON TABLE public.bookings TO service_role;
    DROP POLICY IF EXISTS bookings_select_member ON public.bookings;
    CREATE POLICY bookings_select_member
      ON public.bookings FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_tenants ut
          WHERE ut.tenant_id = bookings.tenant_id
            AND ut.user_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) v_booking_reporting: security_invoker so bookings RLS is honoured
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.v_booking_reporting') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.v_booking_reporting
      WITH (security_invoker = on)
      AS
      SELECT
        b.id AS booking_id,
        b.tenant_id,
        b.reference,
        b.created_at AS booking_created_at,
        b.start_at AS arrival_at,
        b.end_at AS departure_at,
        GREATEST(
          1,
          CEIL(EXTRACT(EPOCH FROM (b.end_at - b.start_at)) / 86400.0)::numeric
        ) AS stay_duration_days,
        CASE
          WHEN b.start_at IS NOT NULL AND b.created_at IS NOT NULL
            THEN GREATEST(
              0,
              FLOOR(EXTRACT(EPOCH FROM (b.start_at - b.created_at)) / 86400.0)::numeric
            )
          ELSE NULL
        END AS booking_lead_days,
        EXTRACT(DOW FROM (b.start_at AT TIME ZONE coalesce(nullif(t.timezone, ''), 'Europe/London')))::integer AS arrival_weekday,
        EXTRACT(DOW FROM (b.end_at AT TIME ZONE coalesce(nullif(t.timezone, ''), 'Europe/London')))::integer AS departure_weekday,
        EXTRACT(MONTH FROM (b.start_at AT TIME ZONE coalesce(nullif(t.timezone, ''), 'Europe/London')))::integer AS arrival_month,
        EXTRACT(YEAR FROM (b.start_at AT TIME ZONE coalesce(nullif(t.timezone, ''), 'Europe/London')))::integer AS arrival_year,
        EXTRACT(MONTH FROM (b.end_at AT TIME ZONE coalesce(nullif(t.timezone, ''), 'Europe/London')))::integer AS departure_month,
        COALESCE(nullif(trim(b.external_source), ''), nullif(trim(b.source::text), ''), 'other') AS channel,
        b.source::text AS source,
        b.external_source,
        b.status::text AS booking_status,
        b.external_status,
        b.ops_status::text AS ops_status,
        b.gate_status::text AS gate_status,
        b.anpr_status::text AS anpr_status,
        b.money_charged,
        b.money_received,
        CASE
          WHEN bf.id IS NOT NULL THEN bf.gross_amount
          ELSE coalesce(b.money_charged, b.money_received, 0)
        END AS gross_revenue,
        CASE WHEN bf.confirmed THEN bf.commission_amount ELSE NULL END AS commission_amount,
        CASE WHEN bf.confirmed THEN bf.net_revenue ELSE NULL END AS net_revenue,
        coalesce(bf.confirmed, false) AS finance_confirmed,
        bf.currency AS finance_currency,
        b.customer_name,
        b.customer_email,
        b.customer_phone,
        b.plate AS vehicle_registration,
        coalesce(nullif(t.timezone, ''), 'Europe/London') AS tenant_timezone
      FROM public.bookings b
      JOIN public.tenants t ON t.id = b.tenant_id
      LEFT JOIN public.booking_financials bf ON bf.booking_id = b.id
    $view$;

    REVOKE ALL ON TABLE public.v_booking_reporting FROM PUBLIC, anon;
    GRANT SELECT ON public.v_booking_reporting TO authenticated;
    GRANT SELECT ON public.v_booking_reporting TO service_role;
  END IF;
END $$;

-- Drop helper (keep schema clean; not part of app API surface)
DROP FUNCTION IF EXISTS public._pc_enable_rls_lock_anon(text);
