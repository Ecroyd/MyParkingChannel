-- Analytics reporting engine (Phase 1)
-- View + financial snapshots + commission rules + saved reports + export audit + aggregate RPC

-- ---------------------------------------------------------------------------
-- Indexes (idempotent; skip if already present)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS bookings_tenant_created_at_idx
  ON public.bookings (tenant_id, created_at);

CREATE INDEX IF NOT EXISTS bookings_tenant_status_idx
  ON public.bookings (tenant_id, status);

CREATE INDEX IF NOT EXISTS bookings_tenant_source_idx
  ON public.bookings (tenant_id, source);

-- ---------------------------------------------------------------------------
-- Snapshotted booking finance (never invent historical commission)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_financials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  commission_amount numeric(12,2) NULL,
  commission_rate numeric(8,4) NULL,
  commission_type text NULL CHECK (commission_type IS NULL OR commission_type IN ('percent', 'fixed')),
  net_revenue numeric(12,2) NULL,
  currency text NOT NULL DEFAULT 'GBP',
  channel text NULL,
  calculation_source text NOT NULL DEFAULT 'rule_snapshot',
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS booking_financials_tenant_confirmed_idx
  ON public.booking_financials (tenant_id, confirmed);

ALTER TABLE public.booking_financials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_financials_tenant_select ON public.booking_financials;
CREATE POLICY booking_financials_tenant_select
  ON public.booking_financials FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.user_id = auth.uid() AND ut.tenant_id = booking_financials.tenant_id
    )
  );

-- ---------------------------------------------------------------------------
-- Tenant channel commission rules (for future snapshots only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_channel_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_code text NOT NULL,
  commission_type text NOT NULL CHECK (commission_type IN ('percent', 'fixed')),
  rate numeric(8,4) NULL,
  amount numeric(12,2) NULL,
  currency text NOT NULL DEFAULT 'GBP',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_channel_commission_rules_lookup_idx
  ON public.tenant_channel_commission_rules (tenant_id, channel_code, is_active, effective_from);

ALTER TABLE public.tenant_channel_commission_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_channel_commission_rules_select ON public.tenant_channel_commission_rules;
CREATE POLICY tenant_channel_commission_rules_select
  ON public.tenant_channel_commission_rules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.user_id = auth.uid() AND ut.tenant_id = tenant_channel_commission_rules.tenant_id
    )
  );

-- ---------------------------------------------------------------------------
-- Saved reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NULL,
  report_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_saved_reports_tenant_idx
  ON public.tenant_saved_reports (tenant_id, updated_at DESC);

ALTER TABLE public.tenant_saved_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_saved_reports_select ON public.tenant_saved_reports;
CREATE POLICY tenant_saved_reports_select
  ON public.tenant_saved_reports FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.user_id = auth.uid() AND ut.tenant_id = tenant_saved_reports.tenant_id
    )
  );

-- ---------------------------------------------------------------------------
-- Export audit (metadata only — never store PII values)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_export_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_user_id uuid NULL,
  export_type text NOT NULL,
  fields text[] NOT NULL DEFAULT '{}',
  date_from date NULL,
  date_to date NULL,
  date_basis text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_export_audit_tenant_idx
  ON public.tenant_export_audit (tenant_id, created_at DESC);

ALTER TABLE public.tenant_export_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_export_audit_select ON public.tenant_export_audit;
CREATE POLICY tenant_export_audit_select
  ON public.tenant_export_audit FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.user_id = auth.uid() AND ut.tenant_id = tenant_export_audit.tenant_id
    )
  );

-- ---------------------------------------------------------------------------
-- Reporting view
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_booking_reporting AS
SELECT
  b.id AS booking_id,
  b.tenant_id,
  b.reference,
  b.created_at AS booking_created_at,
  b.start_at AS arrival_at,
  b.end_at AS departure_at,
  GREATEST(
    1,
    CEIL(
      EXTRACT(EPOCH FROM (b.end_at - b.start_at)) / 86400.0
    )::numeric
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
LEFT JOIN public.booking_financials bf ON bf.booking_id = b.id;

COMMENT ON VIEW public.v_booking_reporting IS
  'Tenant reporting base: derived stay/lead/date parts + optional confirmed finance snapshots. PII columns for authorised export only.';

GRANT SELECT ON public.v_booking_reporting TO authenticated;
GRANT SELECT ON public.v_booking_reporting TO service_role;

-- ---------------------------------------------------------------------------
-- Aggregate RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reporting_aggregate(
  p_tenant_id uuid,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_group_by text DEFAULT 'day',
  p_metrics text[] DEFAULT ARRAY['bookings','gross_revenue']
)
RETURNS TABLE (
  group_key text,
  bookings bigint,
  gross_revenue numeric,
  commission_amount numeric,
  net_revenue numeric,
  money_received numeric,
  avg_booking_value numeric,
  avg_stay numeric,
  avg_lead numeric,
  cancelled_bookings bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
  v_to timestamptz;
  v_basis text := coalesce(p_filters->>'dateBasis', 'arrival');
  v_channel text := nullif(p_filters->>'channel', '');
  v_status text := nullif(p_filters->>'status', '');
  v_stay_min numeric := nullif(p_filters->>'stayMin', '')::numeric;
  v_stay_max numeric := nullif(p_filters->>'stayMax', '')::numeric;
  v_lead_min numeric := nullif(p_filters->>'leadMin', '')::numeric;
  v_lead_max numeric := nullif(p_filters->>'leadMax', '')::numeric;
BEGIN
  IF p_filters ? 'from' AND p_filters->>'from' <> '' THEN
    v_from := (p_filters->>'from')::timestamptz;
  ELSE
    v_from := now() - interval '30 days';
  END IF;
  IF p_filters ? 'to' AND p_filters->>'to' <> '' THEN
    v_to := (p_filters->>'to')::timestamptz;
  ELSE
    v_to := now();
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      r.*,
      CASE v_basis
        WHEN 'booking' THEN r.booking_created_at
        WHEN 'departure' THEN r.departure_at
        ELSE r.arrival_at
      END AS basis_at
    FROM public.v_booking_reporting r
    WHERE r.tenant_id = p_tenant_id
  ),
  filtered AS (
    SELECT *
    FROM base
    WHERE basis_at >= v_from
      AND basis_at < v_to
      AND (v_channel IS NULL OR lower(channel) = lower(v_channel))
      AND (v_status IS NULL OR lower(coalesce(booking_status, '')) = lower(v_status))
      AND (v_stay_min IS NULL OR stay_duration_days >= v_stay_min)
      AND (v_stay_max IS NULL OR stay_duration_days <= v_stay_max)
      AND (v_lead_min IS NULL OR booking_lead_days >= v_lead_min)
      AND (v_lead_max IS NULL OR booking_lead_days <= v_lead_max)
  ),
  grouped AS (
    SELECT
      CASE p_group_by
        WHEN 'channel' THEN coalesce(channel, 'other')
        WHEN 'status' THEN coalesce(booking_status, 'unknown')
        WHEN 'weekday_arrival' THEN arrival_weekday::text
        WHEN 'weekday_departure' THEN departure_weekday::text
        WHEN 'month' THEN to_char(basis_at AT TIME ZONE tenant_timezone, 'YYYY-MM')
        WHEN 'year' THEN to_char(basis_at AT TIME ZONE tenant_timezone, 'YYYY')
        WHEN 'week' THEN to_char(basis_at AT TIME ZONE tenant_timezone, 'IYYY-"W"IW')
        WHEN 'stay_bucket' THEN
          CASE
            WHEN stay_duration_days <= 1 THEN '1'
            WHEN stay_duration_days <= 3 THEN '2-3'
            WHEN stay_duration_days <= 7 THEN '4-7'
            WHEN stay_duration_days <= 14 THEN '8-14'
            ELSE '15+'
          END
        WHEN 'lead_bucket' THEN
          CASE
            WHEN booking_lead_days IS NULL THEN 'unknown'
            WHEN booking_lead_days <= 1 THEN '0-1'
            WHEN booking_lead_days <= 7 THEN '2-7'
            WHEN booking_lead_days <= 30 THEN '8-30'
            WHEN booking_lead_days <= 90 THEN '31-90'
            ELSE '90+'
          END
        ELSE to_char(basis_at AT TIME ZONE tenant_timezone, 'YYYY-MM-DD')
      END AS gk,
      count(*)::bigint AS bookings,
      coalesce(sum(gross_revenue), 0)::numeric AS gross_revenue,
      sum(commission_amount) FILTER (WHERE finance_confirmed)::numeric AS commission_amount,
      sum(net_revenue) FILTER (WHERE finance_confirmed)::numeric AS net_revenue,
      coalesce(sum(money_received), 0)::numeric AS money_received,
      avg(gross_revenue)::numeric AS avg_booking_value,
      avg(stay_duration_days)::numeric AS avg_stay,
      avg(booking_lead_days)::numeric AS avg_lead,
      count(*) FILTER (
        WHERE lower(coalesce(booking_status, '')) IN ('cancelled', 'canceled')
      )::bigint AS cancelled_bookings
    FROM filtered
    GROUP BY 1
  )
  SELECT
    g.gk,
    g.bookings,
    round(g.gross_revenue, 2),
    CASE WHEN g.commission_amount IS NULL THEN NULL ELSE round(g.commission_amount, 2) END,
    CASE WHEN g.net_revenue IS NULL THEN NULL ELSE round(g.net_revenue, 2) END,
    round(g.money_received, 2),
    round(g.avg_booking_value, 2),
    round(g.avg_stay, 2),
    round(g.avg_lead, 2),
    g.cancelled_bookings
  FROM grouped g
  ORDER BY g.gk;
END;
$$;

REVOKE ALL ON FUNCTION public.reporting_aggregate(uuid, jsonb, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reporting_aggregate(uuid, jsonb, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reporting_aggregate(uuid, jsonb, text, text[]) TO service_role;

-- ---------------------------------------------------------------------------
-- KPI RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reporting_kpis(
  p_tenant_id uuid,
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz;
  v_to timestamptz;
  v_basis text := coalesce(p_filters->>'dateBasis', 'arrival');
  v_channel text := nullif(p_filters->>'channel', '');
  v_status text := nullif(p_filters->>'status', '');
  v_stay_min numeric := nullif(p_filters->>'stayMin', '')::numeric;
  v_stay_max numeric := nullif(p_filters->>'stayMax', '')::numeric;
  v_lead_min numeric := nullif(p_filters->>'leadMin', '')::numeric;
  v_lead_max numeric := nullif(p_filters->>'leadMax', '')::numeric;
  v_result jsonb;
BEGIN
  IF p_filters ? 'from' AND p_filters->>'from' <> '' THEN
    v_from := (p_filters->>'from')::timestamptz;
  ELSE
    v_from := now() - interval '30 days';
  END IF;
  IF p_filters ? 'to' AND p_filters->>'to' <> '' THEN
    v_to := (p_filters->>'to')::timestamptz;
  ELSE
    v_to := now();
  END IF;

  WITH base AS (
    SELECT
      r.*,
      CASE v_basis
        WHEN 'booking' THEN r.booking_created_at
        WHEN 'departure' THEN r.departure_at
        ELSE r.arrival_at
      END AS basis_at
    FROM public.v_booking_reporting r
    WHERE r.tenant_id = p_tenant_id
  ),
  filtered AS (
    SELECT *
    FROM base
    WHERE basis_at >= v_from
      AND basis_at < v_to
      AND (v_channel IS NULL OR lower(channel) = lower(v_channel))
      AND (v_status IS NULL OR lower(coalesce(booking_status, '')) = lower(v_status))
      AND (v_stay_min IS NULL OR stay_duration_days >= v_stay_min)
      AND (v_stay_max IS NULL OR stay_duration_days <= v_stay_max)
      AND (v_lead_min IS NULL OR booking_lead_days >= v_lead_min)
      AND (v_lead_max IS NULL OR booking_lead_days <= v_lead_max)
  )
  SELECT jsonb_build_object(
    'bookings', count(*)::bigint,
    'grossRevenue', round(coalesce(sum(gross_revenue), 0), 2),
    'commission', CASE
      WHEN count(*) FILTER (WHERE finance_confirmed) = 0 THEN NULL
      ELSE round(coalesce(sum(commission_amount) FILTER (WHERE finance_confirmed), 0), 2)
    END,
    'netRevenue', CASE
      WHEN count(*) FILTER (WHERE finance_confirmed) = 0 THEN NULL
      ELSE round(coalesce(sum(net_revenue) FILTER (WHERE finance_confirmed), 0), 2)
    END,
    'financeConfirmedCount', count(*) FILTER (WHERE finance_confirmed)::bigint,
    'avgStayDays', round(avg(stay_duration_days), 2),
    'avgLeadDays', round(avg(booking_lead_days), 2),
    'avgBookingValue', round(avg(gross_revenue), 2),
    'moneyReceived', round(coalesce(sum(money_received), 0), 2),
    'cancelledBookings', count(*) FILTER (
      WHERE lower(coalesce(booking_status, '')) IN ('cancelled', 'canceled')
    )::bigint
  )
  INTO v_result
  FROM filtered;

  RETURN coalesce(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.reporting_kpis(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reporting_kpis(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reporting_kpis(uuid, jsonb) TO service_role;
