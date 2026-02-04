-- Ensure booking_import_staging.dedupe_key has a unique constraint so upsert(..., { onConflict: "dedupe_key" }) works predictably.
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_import_staging_dedupe_key_unique
  ON public.booking_import_staging (dedupe_key);
