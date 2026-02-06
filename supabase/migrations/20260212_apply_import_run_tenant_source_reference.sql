-- Use (tenant_id, source, reference) as conflict target so APH re-imports (e.g. CANX) overwrite the same booking.
-- Drops (tenant_id, reference) unique so one booking per tenant+source+reference; updates apply_import_run to
-- upsert by (tenant_id, source, reference) and set status/external_status from staging (so CANX overwrites to cancelled).

DROP INDEX IF EXISTS public.bookings_tenant_reference_uq;
DROP INDEX IF EXISTS public.bookings_tenant_reference_unique;

CREATE OR REPLACE FUNCTION public.apply_import_run(p_run_id uuid)
RETURNS TABLE (
  upserted_count int,
  cancelled_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_upserted int := 0;
  v_cancelled int := 0;
  v_has_cancelled boolean := public.booking_status_has_cancelled();
BEGIN
  -- 1) UPSERT into bookings by (tenant_id, source, reference); overwrite status/external_status so CANX overwrites reserved
  WITH src AS (
    SELECT
      s.tenant_id,
      s.reference,
      nullif(trim(s.source), '') AS source_val,
      nullif(trim(s.customer_name), '') AS customer_name,
      nullif(trim(s.raw_json->>'customer_email'), '') AS customer_email,
      nullif(trim(s.phone), '') AS customer_phone,
      nullif(trim(s.vehicle_reg), '') AS plate,
      nullif(trim(s.vehicle_make), '') AS car_make,
      nullif(trim(s.vehicle_model), '') AS car_model,
      nullif(trim(s.vehicle_colour), '') AS car_color,
      s.start_at,
      s.end_at,
      nullif(trim(s.flight_number), '') AS flight_number,
      nullif(trim(s.return_flight_no), '') AS return_flight_number,
      nullif(trim(s.notes), '') AS notes,
      s.external_reference,
      s.external_status,
      s.status AS staging_status,
      s.raw_json
    FROM public.booking_import_staging s
    WHERE s.run_id = p_run_id
      AND s.reference IS NOT NULL
      AND trim(s.reference) <> ''
  ),
  up AS (
    INSERT INTO public.bookings (
      tenant_id, reference, source,
      customer_name, customer_email, customer_phone,
      plate, car_make, car_model, car_color,
      start_at, end_at,
      flight_number, return_flight_number,
      notes,
      status, external_status,
      updated_at
    )
    SELECT
      src.tenant_id,
      src.reference,
      coalesce(src.source_val, 'manual')::public.booking_source,
      coalesce(src.customer_name, 'Unknown'),
      src.customer_email,
      src.customer_phone,
      src.plate,
      src.car_make,
      src.car_model,
      src.car_color,
      coalesce(src.start_at, now()),
      coalesce(src.end_at, now()),
      src.flight_number,
      src.return_flight_number,
      src.notes,
      CASE
        WHEN src.staging_status ILIKE 'cancel%' OR (src.external_status IS NOT NULL AND (src.external_status ILIKE 'cancel%' OR upper(trim(src.external_status)) = 'CANX'))
        THEN 'cancelled'::public.booking_status
        WHEN v_has_cancelled THEN (coalesce(src.staging_status, 'reserved'))::public.booking_status
        ELSE 'reserved'::public.booking_status
      END,
      src.external_status,
      now()
    FROM src
    ON CONFLICT (tenant_id, source, reference)
    DO UPDATE SET
      customer_name = coalesce(excluded.customer_name, public.bookings.customer_name),
      customer_email = coalesce(excluded.customer_email, public.bookings.customer_email),
      customer_phone = coalesce(excluded.customer_phone, public.bookings.customer_phone),
      plate = coalesce(excluded.plate, public.bookings.plate),
      car_make = coalesce(excluded.car_make, public.bookings.car_make),
      car_model = coalesce(excluded.car_model, public.bookings.car_model),
      car_color = coalesce(excluded.car_color, public.bookings.car_color),
      start_at = coalesce(excluded.start_at, public.bookings.start_at),
      end_at = coalesce(excluded.end_at, public.bookings.end_at),
      flight_number = coalesce(excluded.flight_number, public.bookings.flight_number),
      return_flight_number = coalesce(excluded.return_flight_number, public.bookings.return_flight_number),
      notes = coalesce(excluded.notes, public.bookings.notes),
      source = excluded.source,
      status = excluded.status,
      external_status = excluded.external_status,
      gate_status = CASE WHEN excluded.status = 'cancelled' THEN 'cancelled' ELSE public.bookings.gate_status END,
      updated_at = now()
    RETURNING 1
  )
  SELECT count(*)::int INTO v_upserted FROM up;

  -- 2) Apply cancellations for any staging row that looks cancelled but wasn't in the main upsert (e.g. gate_status)
  WITH cancels AS (
    SELECT DISTINCT s.tenant_id, s.reference, nullif(trim(s.source), '') AS source_val
    FROM public.booking_import_staging s
    WHERE s.run_id = p_run_id
      AND s.reference IS NOT NULL
      AND (
        s.status ILIKE 'cancel%'
        OR s.external_status ILIKE 'cancel%'
        OR (s.external_status IS NOT NULL AND upper(trim(s.external_status)) = 'CANX')
        OR (s.raw_json IS NOT NULL AND s.raw_json::text ILIKE '%cancel%')
      )
  ),
  upd AS (
    UPDATE public.bookings b
    SET
      gate_status = 'cancelled',
      updated_at = now(),
      status = CASE
        WHEN v_has_cancelled THEN 'cancelled'::public.booking_status
        ELSE b.status
      END
    FROM cancels c
    WHERE b.tenant_id = c.tenant_id
      AND b.reference = c.reference
      AND (b.source::text = c.source_val OR (c.source_val IS NULL AND b.source::text = 'manual'))
      AND (b.gate_status IS NULL OR b.gate_status <> 'cancelled')
    RETURNING 1
  )
  SELECT count(*)::int INTO v_cancelled FROM upd;

  -- 3) Audit log
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs') THEN
    INSERT INTO public.audit_logs (actor_user_id, action, target, created_at)
    SELECT
      NULL,
      'import_apply',
      jsonb_build_object(
        'entity', 'booking_import',
        'run_id', p_run_id,
        'tenant_id', s.tenant_id,
        'upserted', v_upserted,
        'cancelled', v_cancelled
      ),
      now()
    FROM (SELECT DISTINCT tenant_id FROM public.booking_import_staging WHERE run_id = p_run_id) s;
  END IF;

  upserted_count := v_upserted;
  cancelled_count := v_cancelled;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.apply_import_run(uuid) IS 'Upserts booking_import_staging into bookings by (tenant_id, source, reference). Overwrites status/external_status so APH CANX re-imports set booking to cancelled. Idempotent.';
