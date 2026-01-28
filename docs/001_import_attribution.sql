-- 001_import_attribution.sql
-- Add parser attribution fields to make source attribution single-source-of-truth

-- Add columns to ingest_email_files
alter table public.ingest_email_files
  add column if not exists parser_key text,
  add column if not exists detected_source text,
  add column if not exists external_source text,
  add column if not exists attribution_confidence text; -- 'parser' | 'detector' | 'fallback'

-- Add external_source to bookings (if not already exists)
alter table public.bookings
  add column if not exists external_source text;

-- Create indexes for performance
create index if not exists ingest_email_files_parser_key_idx on public.ingest_email_files(parser_key);
create index if not exists bookings_external_source_idx on public.bookings(external_source);

-- Add comment for documentation
comment on column public.ingest_email_files.parser_key is 'The parser that successfully parsed this file (e.g., aph_email_import, cavu_email_import)';
comment on column public.ingest_email_files.detected_source is 'Detected source identifier (e.g., APH, CAVU, HOLIDAY_EXTRAS)';
comment on column public.ingest_email_files.external_source is 'Human-readable source label (e.g., APH Email Import, CAVU Email Import)';
comment on column public.ingest_email_files.attribution_confidence is 'How attribution was determined: parser (from successful parser), detector (from email/filename), fallback (default)';
comment on column public.bookings.external_source is 'Human-readable source label matching the import file that created this booking';
