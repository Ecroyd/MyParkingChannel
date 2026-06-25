-- A) ParkVia emails received
select id, received_at, from_address, subject, status, error
from public.ingest_emails
where lower(coalesce(subject,'')) like '%parkvia%'
   or lower(coalesce(from_address,'')) like '%parkvia%'
order by received_at desc
limit 50;

-- B) ParkVia parse records
select e.received_at, e.from_address, e.subject, p.parse_status, p.parse_error, p.booking_reference_guess, p.booking_plate_guess
from public.ingest_emails e
left join public.ingest_email_parses p on p.ingest_email_id = e.id
where lower(coalesce(e.subject,'')) like '%parkvia%'
   or lower(coalesce(e.from_address,'')) like '%parkvia%'
order by e.received_at desc
limit 50;

-- C) EXTZ10 attachments
select e.received_at, e.from_address, e.subject, f.filename, f.parse_status, f.parse_outcome, f.parse_reason, f.parser_key, f.detected_source, f.external_source
from public.ingest_email_files f
join public.ingest_emails e on e.id = f.email_id
where lower(f.filename) like '%extz10%'
order by e.received_at desc
limit 50;

-- D) Staging rows for these examples
select source, reference, customer_name, vehicle_reg, start_at, end_at, status, external_status, price, money_received, source_filename, created_at, raw_json
from public.booking_import_staging
where reference in ('PC90172652', 'KXBZFQ')
order by created_at desc;

-- E) Final bookings for these examples
select reference, source, external_source, customer_name, plate, start_at, end_at, status, gate_status, ops_status, external_status, money_charged, money_received, updated_at
from public.bookings
where reference in ('PC90172652', 'KXBZFQ')
order by updated_at desc;
