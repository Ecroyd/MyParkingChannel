-- PF41125 / PF40926 Flyparks direct email ingest — run before/after reprocess

select
  reference,
  customer_name,
  customer_email,
  plate,
  car_make,
  car_model,
  car_color,
  start_at,
  end_at,
  start_at at time zone 'Europe/London' as start_at_london,
  end_at at time zone 'Europe/London' as end_at_london,
  status,
  gate_status,
  ops_status,
  external_source,
  external_status,
  money_charged,
  money_received,
  return_flight_number,
  created_at,
  updated_at
from public.bookings
where reference in ('PF41125', 'PF40926');

select
  e.id,
  e.received_at,
  e.subject,
  e.status,
  e.error,
  p.parse_status,
  p.parse_error,
  p.booking_reference_guess,
  p.booking_plate_guess
from public.ingest_emails e
left join public.ingest_email_parses p on p.ingest_email_id = e.id
where e.subject ilike '%Flyparks Payment Successful%'
  and (
    e.status = 'failed'
    or p.parse_status = 'failed'
    or e.error is not null
    or p.parse_error is not null
  )
order by e.received_at desc;

select
  e.id,
  e.received_at,
  e.from_address,
  e.to_address,
  e.subject,
  e.status,
  e.error,
  p.parse_status,
  p.parse_error,
  p.booking_reference_guess,
  p.booking_plate_guess
from public.ingest_emails e
left join public.ingest_email_parses p on p.ingest_email_id = e.id
where e.subject ilike '%Flyparks Payment Successful%'
   or p.booking_reference_guess in ('PF41125', 'PF40926')
order by e.received_at desc;

-- Parsed Flyparks emails that may not have a matching booking row yet
select
  e.id as ingest_email_id,
  e.received_at,
  e.status as email_status,
  p.booking_reference_guess as reference,
  p.booking_plate_guess,
  b.id as booking_id
from public.ingest_emails e
join public.ingest_email_parses p on p.ingest_email_id = e.id
left join public.bookings b on b.reference = p.booking_reference_guess
where e.subject ilike '%Flyparks Payment Successful%'
  and e.status in ('parsed', 'failed', 'received')
  and p.booking_reference_guess is not null
  and b.id is null
order by e.received_at desc
limit 100;
