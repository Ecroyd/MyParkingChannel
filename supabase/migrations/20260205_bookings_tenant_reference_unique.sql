-- Flyparks email ingest upsert: one booking per (tenant_id, reference).
-- Used by upsertBookingFromFlyparksParse in /api/ingest/email.
create unique index if not exists bookings_tenant_reference_unique
on public.bookings (tenant_id, reference)
where reference is not null;
