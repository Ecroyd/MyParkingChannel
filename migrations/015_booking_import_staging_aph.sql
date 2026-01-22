-- Add APH-specific columns to booking_import_staging (if not already present)
-- Run in Supabase SQL Editor

-- Add columns if they don't exist
DO $$ 
BEGIN
  -- Add source_email_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'booking_import_staging' 
    AND column_name = 'source_email_id'
  ) THEN
    ALTER TABLE public.booking_import_staging 
    ADD COLUMN source_email_id uuid REFERENCES public.ingest_emails(id) ON DELETE SET NULL;
  END IF;

  -- Add source_filename if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'booking_import_staging' 
    AND column_name = 'source_filename'
  ) THEN
    ALTER TABLE public.booking_import_staging 
    ADD COLUMN source_filename text;
  END IF;

  -- Add external_reference if missing (may already exist as 'reference')
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'booking_import_staging' 
    AND column_name = 'external_reference'
  ) THEN
    ALTER TABLE public.booking_import_staging 
    ADD COLUMN external_reference text;
  END IF;

  -- Add external_status if missing (may already exist as 'status')
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'booking_import_staging' 
    AND column_name = 'external_status'
  ) THEN
    ALTER TABLE public.booking_import_staging 
    ADD COLUMN external_status text;
  END IF;

  -- Add return_flight_no if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'booking_import_staging' 
    AND column_name = 'return_flight_no'
  ) THEN
    ALTER TABLE public.booking_import_staging 
    ADD COLUMN return_flight_no text;
  END IF;

  -- Add product_code if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'booking_import_staging' 
    AND column_name = 'product_code'
  ) THEN
    ALTER TABLE public.booking_import_staging 
    ADD COLUMN product_code text;
  END IF;

  -- Add currency if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'booking_import_staging' 
    AND column_name = 'currency'
  ) THEN
    ALTER TABLE public.booking_import_staging 
    ADD COLUMN currency text DEFAULT 'GBP';
  END IF;

  -- Add total_price if missing (may already exist as 'price')
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'booking_import_staging' 
    AND column_name = 'total_price'
  ) THEN
    ALTER TABLE public.booking_import_staging 
    ADD COLUMN total_price numeric;
  END IF;

  -- Add raw_json if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'booking_import_staging' 
    AND column_name = 'raw_json'
  ) THEN
    ALTER TABLE public.booking_import_staging 
    ADD COLUMN raw_json jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS booking_import_staging_source_email_id_idx 
ON public.booking_import_staging (source_email_id);
