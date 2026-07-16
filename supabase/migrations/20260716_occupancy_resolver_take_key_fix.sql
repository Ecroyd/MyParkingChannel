-- Patch get_current_occupancy fallback: take_key never counts; departure timestamps override stale on-site state.

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

  SELECT jsonb_build_object(
    'missingArrivalDespiteOnSite', count(*) FILTER (
      WHERE lower(coalesce(gate_status::text, '')) IN ('arrived', 'arrived_key_taken')
        AND arrived_at IS NULL AND checked_in_at IS NULL
        AND lower(coalesce(status::text, '')) NOT IN ('cancelled', 'canceled')
        AND lower(coalesce(gate_status::text, '')) NOT IN ('cancelled', 'canceled', 'no_show', 'no-show', 'take_key')
    ),
    'keyRequiredNotArrived', count(*) FILTER (
      WHERE lower(coalesce(gate_status::text, '')) = 'take_key'
        AND arrived_at IS NULL AND checked_in_at IS NULL
    ),
    'departedButMarkedOnSite', count(*) FILTER (
      WHERE coalesce(departed_at, checked_out_at) IS NOT NULL
        AND (
          lower(coalesce(gate_status::text, '')) IN ('arrived', 'arrived_key_taken')
          OR lower(coalesce(anpr_status::text, '')) = 'on_site'
          OR lower(coalesce(status::text, '')) = 'checked_in'
        )
        AND lower(coalesce(gate_status::text, '')) <> 'take_key'
    ),
    'openButCancelledOrNoShow', count(*) FILTER (
      WHERE (
          (coalesce(arrived_at, checked_in_at) IS NOT NULL AND coalesce(departed_at, checked_out_at) IS NULL)
          OR lower(coalesce(gate_status::text, '')) IN ('arrived', 'arrived_key_taken')
          OR lower(coalesce(anpr_status::text, '')) = 'on_site'
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
    'duplicateActiveArrivalEvents', 0
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
    SELECT count(*)::integer
    INTO v_count
    FROM public.bookings b
    WHERE b.tenant_id = p_tenant_id
      AND coalesce(b.arrived_at, b.checked_in_at) IS NOT NULL
      AND coalesce(b.departed_at, b.checked_out_at) IS NULL
      AND coalesce(b.ops_hidden, false) = false
      AND lower(coalesce(b.status::text, '')) NOT IN ('cancelled', 'canceled')
      AND lower(coalesce(b.gate_status::text, '')) NOT IN ('cancelled', 'canceled', 'no_show', 'no-show', 'departed', 'take_key')
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
