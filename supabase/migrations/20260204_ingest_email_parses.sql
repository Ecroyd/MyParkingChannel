-- Table to store parsed/forwarded content from ingest_emails (drop-in forward extractor).
-- One row per ingest_email after parse-received runs.
create table if not exists ingest_email_parses (
  id uuid primary key default gen_random_uuid(),
  ingest_email_id uuid not null references ingest_emails(id) on delete cascade,
  parsed_subject text,
  parsed_text text,
  forwarded_text text,
  booking_plate_guess text,
  booking_reference_guess text,
  parse_status text not null default 'parsed',
  parse_error text,
  parsed_at timestamptz not null default now(),
  unique(ingest_email_id)
);

create index if not exists idx_ingest_email_parses_ingest_email_id
  on ingest_email_parses(ingest_email_id);

create index if not exists idx_ingest_email_parses_parsed_at
  on ingest_email_parses(parsed_at desc);

comment on table ingest_email_parses is 'Parsed/forwarded body from ingest_emails (Flyparks forward extractor)';
