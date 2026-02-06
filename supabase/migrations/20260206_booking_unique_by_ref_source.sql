-- Ensure one booking per tenant+source+reference so re-imports overwrite correctly (e.g. APH CANX overwrites same booking).
-- Use with upsert onConflict: "tenant_id,source,reference". If you already have (tenant_id, reference) unique, a later
-- migration can drop it and update apply_import_run to use this conflict target.
-- Only run when public.bookings exists (table may be created elsewhere or in a later migration).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bookings'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS bookings_tenant_source_reference_uniq
      ON public.bookings (tenant_id, source, reference);
  END IF;
END $$;
