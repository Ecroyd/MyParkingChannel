-- Allow ingest_emails to store failure reason when text-only Flyparks staging/promote fails.
ALTER TABLE public.ingest_emails
  ADD COLUMN IF NOT EXISTS error text;

COMMENT ON COLUMN public.ingest_emails.error IS 'Error message when status = failed (e.g. text-only staging/promote failure).';
