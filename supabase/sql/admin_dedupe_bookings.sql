-- Admin-only: resolve duplicate (tenant_id, reference) before adding unique index.
-- Keeps the row with max(updated_at) per (tenant_id, reference); updates FKs to point to kept id; deletes duplicates.
-- Run only when verify_no_duplicate_bookings.sql returns rows.

-- 1) Create temp table of (tenant_id, reference) -> booking_id to KEEP (newest by updated_at)
CREATE TEMP TABLE _keep AS
SELECT DISTINCT ON (tenant_id, reference) id AS booking_id, tenant_id, reference
FROM public.bookings
WHERE reference IS NOT NULL
ORDER BY tenant_id, reference, updated_at DESC NULLS LAST;

-- 2) Optional: update anpr_events.booking_id to point to kept id (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'anpr_events' AND column_name = 'booking_id') THEN
    UPDATE public.anpr_events e
    SET booking_id = k.booking_id
    FROM public.bookings b
    JOIN _keep k ON k.tenant_id = b.tenant_id AND k.reference = b.reference AND k.booking_id <> b.id
    WHERE e.booking_id = b.id;
  END IF;
END $$;

-- 3) Optional: update gate_events.booking_id (if table/column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'gate_events' AND column_name = 'booking_id') THEN
    UPDATE public.gate_events e
    SET booking_id = k.booking_id
    FROM public.bookings b
    JOIN _keep k ON k.tenant_id = b.tenant_id AND k.reference = b.reference AND k.booking_id <> b.id
    WHERE e.booking_id = b.id;
  END IF;
END $$;

-- 4) Optional: update booking_external_payloads.booking_id (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_external_payloads') THEN
    UPDATE public.booking_external_payloads e
    SET booking_id = k.booking_id
    FROM public.bookings b
    JOIN _keep k ON k.tenant_id = b.tenant_id AND k.reference = b.reference AND k.booking_id <> b.id
    WHERE e.booking_id = b.id;
  END IF;
END $$;

-- 5) Optional: update booking_extensions.booking_id (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_extensions') THEN
    UPDATE public.booking_extensions e
    SET booking_id = k.booking_id
    FROM public.bookings b
    JOIN _keep k ON k.tenant_id = b.tenant_id AND k.reference = b.reference AND k.booking_id <> b.id
    WHERE e.booking_id = b.id;
  END IF;
END $$;

-- 6) Delete duplicate bookings (keep only the one in _keep)
DELETE FROM public.bookings b
USING _keep k
WHERE b.tenant_id = k.tenant_id AND b.reference = k.reference AND b.id <> k.booking_id;

-- 7) Verify: should return 0 rows
-- SELECT tenant_id, reference, count(*) FROM public.bookings WHERE reference IS NOT NULL GROUP BY tenant_id, reference HAVING count(*) > 1;
