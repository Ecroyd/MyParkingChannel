-- Occupancy event ledger, baselines, and reliable-from cutoff.
-- gate_events is NOT reused: it mixes denials/telemetry, inconsistent
-- direction/result/mode vocabularies, mutable processing state, and admin
-- ops never wrote to it. See booking_occupancy_events instead.

-- ---------------------------------------------------------------------------
-- Settings: reliable-from cutoff
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS occupancy_events_reliable_from timestamptz;

COMMENT ON COLUMN public.tenant_settings.occupancy_events_reliable_from IS
  'Actual occupancy chart points before this timestamptz return null; baseline + events apply from here.';

-- ---------------------------------------------------------------------------
-- Movement ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_occupancy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  event_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  event_kind text NOT NULL
    CHECK (event_kind IN ('arrival', 'departure', 'void')),
  delta integer NOT NULL
    CHECK (delta IN (-1, 0, 1)),
  source text NOT NULL
    CHECK (source IN ('manual', 'bulk', 'anpr', 'qr', 'api', 'correction', 'baseline')),
  actor_user_id uuid NULL,
  operation_id uuid NULL,
  voids_event_id uuid NULL REFERENCES public.booking_occupancy_events(id),
  voided_at timestamptz NULL,
  gate_event_id uuid NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS booking_occupancy_events_tenant_event_at_idx
  ON public.booking_occupancy_events (tenant_id, event_at)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS booking_occupancy_events_booking_idx
  ON public.booking_occupancy_events (booking_id, event_at);

CREATE UNIQUE INDEX IF NOT EXISTS booking_occupancy_events_operation_idempotent_uidx
  ON public.booking_occupancy_events (tenant_id, booking_id, event_kind, operation_id)
  WHERE operation_id IS NOT NULL AND event_kind IN ('arrival', 'departure');

COMMENT ON TABLE public.booking_occupancy_events IS
  'Append-only occupancy movement ledger. Actual occupancy = baseline + sum(delta) of non-voided events.';

ALTER TABLE public.booking_occupancy_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_occupancy_events_tenant_select ON public.booking_occupancy_events;
CREATE POLICY booking_occupancy_events_tenant_select
  ON public.booking_occupancy_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.user_id = auth.uid()
        AND ut.tenant_id = booking_occupancy_events.tenant_id
    )
  );

-- ---------------------------------------------------------------------------
-- Verified baselines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenant_occupancy_snapshots (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_at timestamptz NOT NULL,
  occupied_count integer NOT NULL CHECK (occupied_count >= 0),
  source text NOT NULL,
  created_by uuid NULL,
  data_quality text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS tenant_occupancy_snapshots_tenant_snapshot_idx
  ON public.tenant_occupancy_snapshots (tenant_id, snapshot_at DESC);

COMMENT ON TABLE public.tenant_occupancy_snapshots IS
  'Administrator-confirmed occupancy baselines. Chart Actual starts from the verified baseline.';

ALTER TABLE public.tenant_occupancy_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_occupancy_snapshots_tenant_select ON public.tenant_occupancy_snapshots;
CREATE POLICY tenant_occupancy_snapshots_tenant_select
  ON public.tenant_occupancy_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.user_id = auth.uid()
        AND ut.tenant_id = tenant_occupancy_snapshots.tenant_id
    )
  );

-- ---------------------------------------------------------------------------
-- Expected inclusion helper (unchanged semantics)
-- ---------------------------------------------------------------------------
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
    lower(coalesce(p_status, '')) IN ('cancelled', 'canceled')
    OR lower(coalesce(p_gate_status, '')) IN ('cancelled', 'canceled')
    OR lower(coalesce(p_ops_status, '')) IN ('cancelled', 'canceled')
    OR lower(coalesce(p_gate_status, '')) IN ('no_show', 'no-show')
    OR lower(coalesce(p_ops_status, '')) IN ('no_show', 'no-show')
    OR (
      coalesce(p_external_status, '') <> ''
      AND (
        upper(regexp_replace(p_external_status, '\*', '', 'g')) IN ('CANX', 'CANCELLED', 'CANCELED')
        OR upper(regexp_replace(p_external_status, '\*', '', 'g')) LIKE 'CANCEL%'
      )
    )
    OR (
      coalesce(p_ops_hidden, false) = true
      AND lower(coalesce(p_ops_hidden_reason, '')) <> 'departed'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Authoritative current occupancy (booking-state fallback + event-ledger path)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_occupancy(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_reliable_from timestamptz;
  v_snapshot record;
  v_event_sum integer;
  v_count integer;
  v_mode text;
  v_dq jsonb;
  v_negative boolean := false;
BEGIN
  SELECT occupancy_events_reliable_from
  INTO v_reliable_from
  FROM public.tenant_settings
  WHERE tenant_id = p_tenant_id;

  -- Data-quality diagnostics always from booking rows
  SELECT jsonb_build_object(
    'missingArrivalDespiteOnSite', count(*) FILTER (
      WHERE lower(coalesce(gate_status::text, '')) IN ('arrived', 'arrived_key_taken')
        AND arrived_at IS NULL AND checked_in_at IS NULL
        AND lower(coalesce(status::text, '')) NOT IN ('cancelled', 'canceled')
        AND lower(coalesce(gate_status::text, '')) NOT IN ('cancelled', 'canceled', 'no_show', 'no-show')
    ),
    'openButCancelledOrNoShow', count(*) FILTER (
      WHERE (
          (arrived_at IS NOT NULL AND departed_at IS NULL)
          OR (checked_in_at IS NOT NULL AND checked_out_at IS NULL)
          OR lower(coalesce(gate_status::text, '')) IN ('arrived', 'arrived_key_taken')
        )
        AND (
          lower(coalesce(status::text, '')) IN ('cancelled', 'canceled')
          OR lower(coalesce(gate_status::text, '')) IN ('cancelled', 'canceled', 'no_show', 'no-show')
          OR lower(coalesce(ops_status::text, '')) IN ('cancelled', 'canceled', 'no_show', 'no-show')
        )
    ),
    'departureBeforeArrival', count(*) FILTER (
      WHERE coalesce(arrived_at, checked_in_at) IS NOT NULL
        AND coalesce(departed_at, checked_out_at) IS NOT NULL
        AND coalesce(departed_at, checked_out_at) < coalesce(arrived_at, checked_in_at)
    ),
    'duplicateActiveArrivalEvents', (
      SELECT count(*)::integer FROM (
        SELECT booking_id
        FROM public.booking_occupancy_events e
        WHERE e.tenant_id = p_tenant_id
          AND e.voided_at IS NULL
          AND e.event_kind = 'arrival'
        GROUP BY booking_id
        HAVING count(*) > 1
           AND NOT EXISTS (
             SELECT 1 FROM public.booking_occupancy_events d
             WHERE d.tenant_id = p_tenant_id
               AND d.booking_id = e.booking_id
               AND d.voided_at IS NULL
               AND d.event_kind = 'departure'
               AND d.event_at >= max(e.event_at)
           )
      ) dup
    )
  )
  INTO v_dq
  FROM public.bookings
  WHERE tenant_id = p_tenant_id;

  IF v_reliable_from IS NOT NULL AND now() >= v_reliable_from THEN
    SELECT *
    INTO v_snapshot
    FROM public.tenant_occupancy_snapshots
    WHERE tenant_id = p_tenant_id
      AND snapshot_at <= now()
    ORDER BY snapshot_at DESC
    LIMIT 1;

    IF v_snapshot.tenant_id IS NOT NULL THEN
      SELECT coalesce(sum(e.delta), 0)::integer
      INTO v_event_sum
      FROM public.booking_occupancy_events e
      WHERE e.tenant_id = p_tenant_id
        AND e.voided_at IS NULL
        AND e.event_kind IN ('arrival', 'departure')
        AND e.event_at > v_snapshot.snapshot_at
        AND e.event_at <= now();

      v_count := v_snapshot.occupied_count + coalesce(v_event_sum, 0);
      IF v_count < 0 THEN
        v_negative := true;
        v_count := 0;
      END IF;
      v_mode := 'event_ledger';
    ELSE
      v_mode := 'fallback_booking_state';
    END IF;
  ELSE
    v_mode := 'fallback_booking_state';
  END IF;

  IF v_mode = 'fallback_booking_state' THEN
    -- Matches isAuthoritativeOnSite / isCurrentlyParked:
    -- arrival set, departure null, not hidden/cancelled/no-show, physical on-site.
    -- take_key never counts. Departure timestamp overrides stale on-site state.
    SELECT count(*)::integer
    INTO v_count
    FROM public.bookings b
    WHERE b.tenant_id = p_tenant_id
      AND coalesce(b.ops_hidden, false) = false
      AND lower(coalesce(b.status::text, '')) NOT IN ('cancelled', 'canceled')
      AND lower(coalesce(b.gate_status::text, '')) NOT IN (
        'cancelled', 'canceled', 'no_show', 'no-show', 'departed', 'take_key'
      )
      AND lower(coalesce(b.ops_status::text, '')) NOT IN (
        'cancelled', 'canceled', 'no_show', 'no-show'
      )
      AND coalesce(b.arrived_at, b.checked_in_at) IS NOT NULL
      AND coalesce(b.departed_at, b.checked_out_at) IS NULL
      AND (
        lower(coalesce(b.gate_status::text, '')) IN ('arrived', 'arrived_key_taken')
        OR lower(coalesce(b.anpr_status::text, '')) = 'on_site'
        OR lower(coalesce(b.status::text, '')) = 'checked_in'
      );
  END IF;

  RETURN jsonb_build_object(
    'occupiedCount', coalesce(v_count, 0),
    'mode', v_mode,
    'reliableFrom', v_reliable_from,
    'negativeOccupancyDetected', v_negative,
    'dataQuality', coalesce(v_dq, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_occupancy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_occupancy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_occupancy(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Atomic booking ops + occupancy event
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_booking_occupancy_action(
  p_booking_id uuid,
  p_action text,
  p_actor_user_id uuid,
  p_source text DEFAULT 'manual',
  p_operation_id uuid DEFAULT NULL,
  p_event_at timestamptz DEFAULT now(),
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  b record;
  v_now timestamptz := coalesce(p_event_at, now());
  v_updates jsonb := '{}'::jsonb;
  v_event_id uuid;
  v_void_id uuid;
  v_prior_arrival uuid;
  v_prior_departure uuid;
  v_delta integer := 0;
  v_kind text;
  v_on_site boolean;
  v_idempotent boolean := false;
  v_existing uuid;
BEGIN
  IF p_action NOT IN ('reserved', 'arrived', 'arrived_key_taken', 'take_key', 'departed', 'no_show', 'cancelled') THEN
    RAISE EXCEPTION 'invalid action %', p_action;
  END IF;

  SELECT *
  INTO b
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  -- Idempotency by operation_id
  IF p_operation_id IS NOT NULL AND p_action IN ('arrived', 'arrived_key_taken', 'departed') THEN
    v_kind := CASE WHEN p_action = 'departed' THEN 'departure' ELSE 'arrival' END;
    SELECT id INTO v_existing
    FROM public.booking_occupancy_events
    WHERE tenant_id = b.tenant_id
      AND booking_id = b.id
      AND event_kind = v_kind
      AND operation_id = p_operation_id
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object(
        'bookingId', b.id,
        'idempotent', true,
        'eventId', v_existing,
        'delta', 0
      );
    END IF;
  END IF;

  v_on_site := lower(coalesce(b.gate_status::text, '')) IN ('arrived', 'arrived_key_taken');

  -- Apply booking snapshot updates (compatibility timestamps preserved, not history)
  IF p_action = 'reserved' THEN
    UPDATE public.bookings SET
      gate_status = 'reserved',
      status = 'reserved',
      arrived_at = NULL,
      departed_at = NULL,
      checked_in_at = NULL,
      checked_out_at = NULL,
      highlight_code = 'none',
      anpr_status = 'not_arrived',
      ops_hidden = false,
      ops_hidden_reason = NULL,
      ops_hidden_at = NULL,
      ops_hidden_by = NULL,
      updated_at = v_now
    WHERE id = b.id;

    IF v_on_site THEN
      SELECT id INTO v_prior_arrival
      FROM public.booking_occupancy_events
      WHERE tenant_id = b.tenant_id
        AND booking_id = b.id
        AND event_kind = 'arrival'
        AND voided_at IS NULL
      ORDER BY event_at DESC
      LIMIT 1;

      IF v_prior_arrival IS NOT NULL THEN
        UPDATE public.booking_occupancy_events
        SET voided_at = v_now
        WHERE id = v_prior_arrival;

        INSERT INTO public.booking_occupancy_events (
          tenant_id, booking_id, event_at, event_kind, delta, source,
          actor_user_id, operation_id, voids_event_id, metadata
        ) VALUES (
          b.tenant_id, b.id, v_now, 'void', -1, coalesce(p_source, 'correction'),
          p_actor_user_id, p_operation_id, v_prior_arrival,
          coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('reason', 'revert_arrival', 'action', p_action)
        )
        RETURNING id INTO v_void_id;
        v_delta := -1;
      END IF;
    END IF;

  ELSIF p_action IN ('arrived', 'arrived_key_taken') THEN
    UPDATE public.bookings SET
      gate_status = p_action,
      status = 'checked_in',
      arrived_at = coalesce(arrived_at, v_now),
      checked_in_at = coalesce(checked_in_at, v_now),
      checked_out_at = NULL,
      highlight_code = CASE WHEN p_action = 'arrived_key_taken' THEN 'key' ELSE 'none' END,
      anpr_status = 'on_site',
      ops_hidden = false,
      ops_hidden_reason = NULL,
      ops_hidden_at = NULL,
      ops_hidden_by = NULL,
      updated_at = v_now
    WHERE id = b.id;

    IF NOT v_on_site THEN
      INSERT INTO public.booking_occupancy_events (
        tenant_id, booking_id, event_at, event_kind, delta, source,
        actor_user_id, operation_id, metadata
      ) VALUES (
        b.tenant_id, b.id, v_now, 'arrival', 1, coalesce(p_source, 'manual'),
        p_actor_user_id, p_operation_id,
        coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('action', p_action)
      )
      RETURNING id INTO v_event_id;
      v_delta := 1;
    ELSE
      v_idempotent := true;
    END IF;

  ELSIF p_action = 'take_key' THEN
    UPDATE public.bookings SET
      gate_status = 'take_key',
      highlight_code = 'key',
      updated_at = v_now
    WHERE id = b.id;
    -- No occupancy delta

  ELSIF p_action = 'departed' THEN
    UPDATE public.bookings SET
      gate_status = 'departed',
      status = 'checked_out',
      departed_at = coalesce(departed_at, v_now),
      checked_out_at = coalesce(checked_out_at, v_now),
      checked_in_at = coalesce(checked_in_at, arrived_at, v_now),
      arrived_at = coalesce(arrived_at, checked_in_at, v_now),
      anpr_status = 'departed',
      ops_hidden = true,
      ops_hidden_reason = 'departed',
      ops_hidden_at = v_now,
      ops_hidden_by = p_actor_user_id,
      updated_at = v_now
    WHERE id = b.id;

    IF v_on_site OR lower(coalesce(b.gate_status::text, '')) NOT IN ('departed') THEN
      -- Only emit departure if not already departed (idempotent)
      IF lower(coalesce(b.gate_status::text, '')) <> 'departed' THEN
        INSERT INTO public.booking_occupancy_events (
          tenant_id, booking_id, event_at, event_kind, delta, source,
          actor_user_id, operation_id, metadata
        ) VALUES (
          b.tenant_id, b.id, v_now, 'departure', -1, coalesce(p_source, 'manual'),
          p_actor_user_id, p_operation_id,
          coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('action', p_action)
        )
        RETURNING id INTO v_event_id;
        v_delta := -1;
      ELSE
        v_idempotent := true;
      END IF;
    ELSE
      v_idempotent := true;
    END IF;

  ELSIF p_action = 'no_show' THEN
    UPDATE public.bookings SET
      gate_status = 'no_show',
      highlight_code = 'none',
      ops_hidden = false,
      ops_hidden_reason = NULL,
      ops_hidden_at = NULL,
      ops_hidden_by = NULL,
      updated_at = v_now
    WHERE id = b.id;

    IF v_on_site THEN
      SELECT id INTO v_prior_arrival
      FROM public.booking_occupancy_events
      WHERE tenant_id = b.tenant_id
        AND booking_id = b.id
        AND event_kind = 'arrival'
        AND voided_at IS NULL
      ORDER BY event_at DESC
      LIMIT 1;
      IF v_prior_arrival IS NOT NULL THEN
        UPDATE public.booking_occupancy_events SET voided_at = v_now WHERE id = v_prior_arrival;
        INSERT INTO public.booking_occupancy_events (
          tenant_id, booking_id, event_at, event_kind, delta, source,
          actor_user_id, operation_id, voids_event_id, metadata
        ) VALUES (
          b.tenant_id, b.id, v_now, 'void', -1, coalesce(p_source, 'manual'),
          p_actor_user_id, p_operation_id, v_prior_arrival,
          coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('reason', 'no_show_after_arrival')
        );
        v_delta := -1;
      END IF;
    END IF;

  ELSIF p_action = 'cancelled' THEN
    UPDATE public.bookings SET
      gate_status = 'cancelled',
      status = 'cancelled',
      external_status = 'cancelled',
      arrived_at = NULL,
      departed_at = NULL,
      checked_in_at = NULL,
      checked_out_at = NULL,
      highlight_code = 'none',
      ops_hidden = true,
      ops_hidden_reason = 'cancelled',
      ops_hidden_at = v_now,
      ops_hidden_by = p_actor_user_id,
      updated_at = v_now
    WHERE id = b.id;

    IF v_on_site THEN
      SELECT id INTO v_prior_arrival
      FROM public.booking_occupancy_events
      WHERE tenant_id = b.tenant_id
        AND booking_id = b.id
        AND event_kind = 'arrival'
        AND voided_at IS NULL
      ORDER BY event_at DESC
      LIMIT 1;
      IF v_prior_arrival IS NOT NULL THEN
        UPDATE public.booking_occupancy_events SET voided_at = v_now WHERE id = v_prior_arrival;
        INSERT INTO public.booking_occupancy_events (
          tenant_id, booking_id, event_at, event_kind, delta, source,
          actor_user_id, operation_id, voids_event_id, metadata
        ) VALUES (
          b.tenant_id, b.id, v_now, 'void', -1, coalesce(p_source, 'manual'),
          p_actor_user_id, p_operation_id, v_prior_arrival,
          coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('reason', 'cancelled_after_arrival')
        );
        v_delta := -1;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (tenant_id, actor_user_id, action, entity, entity_id, metadata, created_at)
  VALUES (
    b.tenant_id,
    p_actor_user_id,
    'booking_ops_status_updated',
    'booking',
    b.id,
    jsonb_build_object(
      'opsAction', p_action,
      'source', p_source,
      'operationId', p_operation_id,
      'occupancyDelta', v_delta,
      'eventId', v_event_id,
      'voidEventId', v_void_id
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'bookingId', b.id,
    'tenantId', b.tenant_id,
    'action', p_action,
    'delta', v_delta,
    'eventId', v_event_id,
    'voidEventId', v_void_id,
    'idempotent', v_idempotent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_booking_occupancy_action(uuid, text, uuid, text, uuid, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_booking_occupancy_action(uuid, text, uuid, text, uuid, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_booking_occupancy_action(uuid, text, uuid, text, uuid, timestamptz, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Timeseries: Expected from schedule; Actual from baseline + events
-- ---------------------------------------------------------------------------
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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_reliable_from timestamptz;
  v_tz text;
  v_tenant_default integer;
  v_settings_default integer;
BEGIN
  SELECT
    ts.occupancy_events_reliable_from,
    coalesce(nullif(t.timezone, ''), 'Europe/London'),
    t.default_capacity,
    ts.default_daily_capacity
  INTO v_reliable_from, v_tz, v_tenant_default, v_settings_default
  FROM public.tenants t
  LEFT JOIN public.tenant_settings ts ON ts.tenant_id = t.id
  WHERE t.id = p_tenant_id;

  RETURN QUERY
  WITH slots AS (
    SELECT generate_series(
      p_from,
      p_to - make_interval(mins => p_interval_minutes),
      make_interval(mins => p_interval_minutes)
    ) AS slot_at
  ),
  expected AS (
    SELECT
      s.slot_at,
      count(*) FILTER (
        WHERE public.booking_is_included_in_expected_occupancy(
          b.status::text, b.gate_status::text, b.ops_status::text,
          b.ops_hidden, b.ops_hidden_reason, b.external_status
        )
        AND b.start_at <= s.slot_at
        AND b.end_at > s.slot_at
      )::integer AS expected_count
    FROM slots s
    LEFT JOIN public.bookings b
      ON b.tenant_id = p_tenant_id
     AND b.start_at < p_to
     AND b.end_at > p_from
    GROUP BY s.slot_at
  ),
  snapshot_for AS (
    SELECT
      s.slot_at,
      (
        SELECT snap.occupied_count
        FROM public.tenant_occupancy_snapshots snap
        WHERE snap.tenant_id = p_tenant_id
          AND snap.snapshot_at <= s.slot_at
        ORDER BY snap.snapshot_at DESC
        LIMIT 1
      ) AS base_count,
      (
        SELECT snap.snapshot_at
        FROM public.tenant_occupancy_snapshots snap
        WHERE snap.tenant_id = p_tenant_id
          AND snap.snapshot_at <= s.slot_at
        ORDER BY snap.snapshot_at DESC
        LIMIT 1
      ) AS base_at
    FROM slots s
  ),
  actual AS (
    SELECT
      sf.slot_at,
      CASE
        WHEN v_reliable_from IS NULL THEN NULL
        WHEN sf.slot_at < v_reliable_from THEN NULL
        WHEN sf.slot_at > now() THEN NULL
        WHEN sf.base_at IS NULL THEN NULL
        ELSE greatest(
          0,
          sf.base_count + coalesce((
            SELECT sum(e.delta)::integer
            FROM public.booking_occupancy_events e
            WHERE e.tenant_id = p_tenant_id
              AND e.voided_at IS NULL
              AND e.event_kind IN ('arrival', 'departure')
              AND e.event_at > sf.base_at
              AND e.event_at <= sf.slot_at
          ), 0)
        )
      END AS actual_count
    FROM snapshot_for sf
  )
  SELECT
    e.slot_at,
    e.expected_count,
    a.actual_count,
    coalesce(
      tc.capacity,
      v_tenant_default,
      v_settings_default
    )::integer AS capacity
  FROM expected e
  JOIN actual a ON a.slot_at = e.slot_at
  LEFT JOIN public.tenant_capacity tc
    ON tc.tenant_id = p_tenant_id
   AND tc.date = ((e.slot_at AT TIME ZONE v_tz)::date)
  ORDER BY e.slot_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_occupancy_timeseries(uuid, timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_occupancy_timeseries(uuid, timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_occupancy_timeseries(uuid, timestamptz, timestamptz, integer) TO service_role;

COMMENT ON FUNCTION public.get_occupancy_timeseries IS
  'Half-hourly expected (schedule) vs actual (baseline + occupancy events). Actual null before reliable_from.';
