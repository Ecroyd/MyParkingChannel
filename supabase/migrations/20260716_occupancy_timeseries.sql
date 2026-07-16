-- Occupancy timeseries RPC + expected-occupancy helper + supporting indexes.
-- Mirrors src/lib/analytics/occupancyTimeseries.ts

CREATE OR REPLACE FUNCTION public.booking_is_included_in_expected_occupancy(
  p_status text,
  p_gate_status text,
  p_ops_status text,
  p_ops_hidden boolean,
  p_ops_hidden_reason text,
  p_external_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NOT (
    lower(coalesce(p_status, '')) = 'cancelled'
    OR lower(coalesce(p_gate_status, '')) = 'cancelled'
    OR lower(coalesce(p_ops_status, '')) = 'cancelled'
    OR lower(coalesce(p_gate_status, '')) = 'no_show'
    OR lower(coalesce(p_ops_status, '')) = 'no_show'
    OR (
      coalesce(p_external_status, '') <> ''
      AND (
        upper(regexp_replace(p_external_status, '\*', '', 'g')) IN ('CANX', 'CANCELLED')
        OR upper(regexp_replace(p_external_status, '\*', '', 'g')) LIKE 'CANCEL%'
      )
    )
    OR (
      coalesce(p_ops_hidden, false) = true
      AND lower(coalesce(p_ops_hidden_reason, '')) <> 'departed'
    )
  );
$$;

COMMENT ON FUNCTION public.booking_is_included_in_expected_occupancy IS
  'Expected occupancy inclusion: exclude cancelled, no_show, and ops_hidden (except departed soft-hide).';

CREATE OR REPLACE FUNCTION public.get_occupancy_timeseries(
  p_tenant_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_interval_minutes integer DEFAULT 30
)
RETURNS TABLE (
  slot_at timestamptz,
  expected_count integer,
  actual_count integer,
  capacity integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH slots AS (
    SELECT generate_series(
      p_from,
      p_to - make_interval(mins => p_interval_minutes),
      make_interval(mins => p_interval_minutes)
    ) AS slot_at
  ),
  tenant_defaults AS (
    SELECT
      t.default_capacity AS tenant_default_capacity,
      ts.default_daily_capacity AS settings_default_capacity,
      coalesce(nullif(t.timezone, ''), 'Europe/London') AS timezone
    FROM public.tenants t
    LEFT JOIN public.tenant_settings ts ON ts.tenant_id = t.id
    WHERE t.id = p_tenant_id
  ),
  booking_intervals AS (
    SELECT
      b.id,
      b.start_at,
      b.end_at,
      coalesce(b.arrived_at, b.checked_in_at) AS actual_arrival_at,
      coalesce(b.departed_at, b.checked_out_at) AS actual_departure_at,
      public.booking_is_included_in_expected_occupancy(
        b.status::text,
        b.gate_status::text,
        b.ops_status::text,
        b.ops_hidden,
        b.ops_hidden_reason,
        b.external_status
      ) AS include_expected
    FROM public.bookings b
    WHERE b.tenant_id = p_tenant_id
      AND (
        (b.start_at < p_to AND b.end_at > p_from)
        OR (
          coalesce(b.arrived_at, b.checked_in_at) IS NOT NULL
          AND coalesce(b.arrived_at, b.checked_in_at) < p_to
          AND (
            coalesce(b.departed_at, b.checked_out_at) IS NULL
            OR coalesce(b.departed_at, b.checked_out_at) > p_from
          )
        )
      )
  ),
  counted AS (
    SELECT
      s.slot_at,
      count(*) FILTER (
        WHERE bi.include_expected
          AND bi.start_at <= s.slot_at
          AND bi.end_at > s.slot_at
      )::integer AS expected_count,
      CASE
        WHEN s.slot_at > now() THEN NULL
        ELSE count(*) FILTER (
          WHERE bi.actual_arrival_at IS NOT NULL
            AND bi.actual_arrival_at <= s.slot_at
            AND (
              bi.actual_departure_at IS NULL
              OR bi.actual_departure_at >= bi.actual_arrival_at
            )
            AND (
              bi.actual_departure_at IS NULL
              OR bi.actual_departure_at > s.slot_at
            )
        )::integer
      END AS actual_count
    FROM slots s
    LEFT JOIN booking_intervals bi
      ON (
        (bi.include_expected AND bi.start_at <= s.slot_at AND bi.end_at > s.slot_at)
        OR (
          bi.actual_arrival_at IS NOT NULL
          AND bi.actual_arrival_at <= s.slot_at
          AND (
            bi.actual_departure_at IS NULL
            OR bi.actual_departure_at > s.slot_at
          )
        )
      )
    GROUP BY s.slot_at
  )
  SELECT
    c.slot_at,
    c.expected_count,
    c.actual_count,
    coalesce(
      tc.capacity,
      td.tenant_default_capacity,
      td.settings_default_capacity
    )::integer AS capacity
  FROM counted c
  CROSS JOIN tenant_defaults td
  LEFT JOIN public.tenant_capacity tc
    ON tc.tenant_id = p_tenant_id
   AND tc.date = ((c.slot_at AT TIME ZONE td.timezone)::date)
  ORDER BY c.slot_at;
$$;

COMMENT ON FUNCTION public.get_occupancy_timeseries IS
  'Five-minute expected vs actual car park occupancy for a tenant window [p_from, p_to).';

REVOKE ALL ON FUNCTION public.get_occupancy_timeseries(uuid, timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_occupancy_timeseries(uuid, timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_occupancy_timeseries(uuid, timestamptz, timestamptz, integer) TO service_role;

REVOKE ALL ON FUNCTION public.booking_is_included_in_expected_occupancy(text, text, text, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.booking_is_included_in_expected_occupancy(text, text, text, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booking_is_included_in_expected_occupancy(text, text, text, boolean, text, text) TO service_role;

-- Indexes for occupancy scans (skip if already present)
CREATE INDEX IF NOT EXISTS bookings_tenant_start_at_idx
  ON public.bookings (tenant_id, start_at);

CREATE INDEX IF NOT EXISTS bookings_tenant_end_at_idx
  ON public.bookings (tenant_id, end_at);

CREATE INDEX IF NOT EXISTS bookings_tenant_arrived_departed_idx
  ON public.bookings (tenant_id, arrived_at, departed_at)
  WHERE arrived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS bookings_tenant_checked_in_out_idx
  ON public.bookings (tenant_id, checked_in_at, checked_out_at)
  WHERE checked_in_at IS NOT NULL;
