-- supplier_status: raw token from import file (*FIRM*, CANX, etc.)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS supplier_status text;

ALTER TABLE public.booking_import_staging
  ADD COLUMN IF NOT EXISTS supplier_status text;

-- One booking per tenant + reference (safe upsert target)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bookings_tenant_reference_unique'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_tenant_reference_unique UNIQUE (tenant_id, reference);
  END IF;
END $$;
