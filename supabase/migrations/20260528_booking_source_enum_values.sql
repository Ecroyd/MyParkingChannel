-- Align booking_source enum with import platform ids (holiday_extras, aph).
DO $$
BEGIN
  ALTER TYPE public.booking_source ADD VALUE 'holiday_extras';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE public.booking_source ADD VALUE 'aph';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
