-- Tenant-scoped website conversion funnel (first-party analytics)
-- Events are append-only; dashboards read daily aggregates to avoid high-volume scans.

-- ---------------------------------------------------------------------------
-- Raw events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.website_conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  anonymous_id text NOT NULL,
  session_id text NOT NULL,
  event_name text NOT NULL CHECK (event_name IN (
    'website_session',
    'availability_search',
    'availability_result',
    'booking_started',
    'customer_details_started',
    'checkout_started',
    'payment_started',
    'booking_completed',
    'booking_failed'
  )),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  landing_page text NULL,
  referrer text NULL,
  device_class text NULL CHECK (
    device_class IS NULL OR device_class IN ('mobile', 'tablet', 'desktop', 'unknown')
  ),
  source text NULL,
  medium text NULL,
  campaign text NULL,
  utm_source text NULL,
  utm_medium text NULL,
  utm_campaign text NULL,
  utm_term text NULL,
  utm_content text NULL,
  attribution_channel text NULL CHECK (
    attribution_channel IS NULL OR attribution_channel IN (
      'organic', 'direct', 'referral', 'paid', 'social', 'unknown'
    )
  ),
  booking_value_cents integer NULL CHECK (booking_value_cents IS NULL OR booking_value_cents >= 0),
  booking_currency text NULL,
  booking_reference text NULL,
  dedupe_key text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_conversion_events_tenant_dedupe UNIQUE (tenant_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS website_conversion_events_tenant_occurred_idx
  ON public.website_conversion_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS website_conversion_events_tenant_event_occurred_idx
  ON public.website_conversion_events (tenant_id, event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS website_conversion_events_tenant_channel_idx
  ON public.website_conversion_events (tenant_id, attribution_channel, occurred_at DESC)
  WHERE attribution_channel IS NOT NULL;

CREATE INDEX IF NOT EXISTS website_conversion_events_tenant_reference_idx
  ON public.website_conversion_events (tenant_id, booking_reference)
  WHERE booking_reference IS NOT NULL;

ALTER TABLE public.website_conversion_events ENABLE ROW LEVEL SECURITY;

-- Authenticated tenant members may read their own events (service role writes).
DROP POLICY IF EXISTS website_conversion_events_tenant_select ON public.website_conversion_events;
CREATE POLICY website_conversion_events_tenant_select
  ON public.website_conversion_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.user_id = auth.uid()
        AND ut.tenant_id = website_conversion_events.tenant_id
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.website_conversion_events FROM anon, authenticated;
GRANT SELECT ON public.website_conversion_events TO authenticated;

-- ---------------------------------------------------------------------------
-- Daily aggregates (dashboard reads these — not live polling of raw events)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.website_conversion_daily (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  day date NOT NULL,
  event_name text NOT NULL,
  attribution_channel text NOT NULL DEFAULT 'all',
  event_count bigint NOT NULL DEFAULT 0,
  booking_value_cents_sum bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day, event_name, attribution_channel)
);

CREATE INDEX IF NOT EXISTS website_conversion_daily_tenant_day_idx
  ON public.website_conversion_daily (tenant_id, day DESC);

ALTER TABLE public.website_conversion_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS website_conversion_daily_tenant_select ON public.website_conversion_daily;
CREATE POLICY website_conversion_daily_tenant_select
  ON public.website_conversion_daily FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.user_id = auth.uid()
        AND ut.tenant_id = website_conversion_daily.tenant_id
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.website_conversion_daily FROM anon, authenticated;
GRANT SELECT ON public.website_conversion_daily TO authenticated;

-- ---------------------------------------------------------------------------
-- Rollup trigger: increment daily counters only when a new event is inserted
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.website_conversion_events_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date := (NEW.occurred_at AT TIME ZONE 'UTC')::date;
  ch text := COALESCE(NEW.attribution_channel, 'unknown');
  value_cents bigint := COALESCE(NEW.booking_value_cents, 0);
BEGIN
  INSERT INTO public.website_conversion_daily AS dly
    (tenant_id, day, event_name, attribution_channel, event_count, booking_value_cents_sum)
  VALUES
    (NEW.tenant_id, d, NEW.event_name, 'all', 1, value_cents)
  ON CONFLICT (tenant_id, day, event_name, attribution_channel)
  DO UPDATE SET
    event_count = dly.event_count + 1,
    booking_value_cents_sum = dly.booking_value_cents_sum + EXCLUDED.booking_value_cents_sum;

  INSERT INTO public.website_conversion_daily AS dly
    (tenant_id, day, event_name, attribution_channel, event_count, booking_value_cents_sum)
  VALUES
    (NEW.tenant_id, d, NEW.event_name, ch, 1, value_cents)
  ON CONFLICT (tenant_id, day, event_name, attribution_channel)
  DO UPDATE SET
    event_count = dly.event_count + 1,
    booking_value_cents_sum = dly.booking_value_cents_sum + EXCLUDED.booking_value_cents_sum;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS website_conversion_events_rollup_trg ON public.website_conversion_events;
CREATE TRIGGER website_conversion_events_rollup_trg
  AFTER INSERT ON public.website_conversion_events
  FOR EACH ROW
  EXECUTE FUNCTION public.website_conversion_events_rollup();

-- ---------------------------------------------------------------------------
-- Optional admin-saved migration comparison presets (tenant-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.website_migration_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Domain migration',
  migration_date date NOT NULL,
  comparison_days integer NOT NULL DEFAULT 30 CHECK (comparison_days > 0 AND comparison_days <= 365),
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS website_migration_comparisons_tenant_idx
  ON public.website_migration_comparisons (tenant_id, updated_at DESC);

ALTER TABLE public.website_migration_comparisons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS website_migration_comparisons_tenant_select ON public.website_migration_comparisons;
CREATE POLICY website_migration_comparisons_tenant_select
  ON public.website_migration_comparisons FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.user_id = auth.uid()
        AND ut.tenant_id = website_migration_comparisons.tenant_id
    )
  );

DROP POLICY IF EXISTS website_migration_comparisons_tenant_write ON public.website_migration_comparisons;
CREATE POLICY website_migration_comparisons_tenant_write
  ON public.website_migration_comparisons FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.user_id = auth.uid()
        AND ut.tenant_id = website_migration_comparisons.tenant_id
        AND ut.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.user_id = auth.uid()
        AND ut.tenant_id = website_migration_comparisons.tenant_id
        AND ut.role IN ('owner', 'admin')
    )
  );
