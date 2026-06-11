-- Preflight duplicate check before applying the bookings unique index:
-- select tenant_id, source, reference, count(*) as duplicate_count
-- from public.bookings
-- where reference is not null
--   and btrim(reference) <> ''
-- group by tenant_id, source, reference
-- having count(*) > 1;

create unique index if not exists bookings_tenant_source_reference_uidx
on public.bookings (tenant_id, source, reference)
where reference is not null
  and btrim(reference) <> '';

create unique index if not exists booking_external_payloads_tenant_source_reference_uidx
on public.booking_external_payloads (tenant_id, source, reference);
