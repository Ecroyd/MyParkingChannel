-- Speed up Today page range queries: arrivals by start_at, departures by end_at, overlap scans.
CREATE INDEX IF NOT EXISTS bookings_tenant_start_at_idx
  ON public.bookings (tenant_id, start_at);

CREATE INDEX IF NOT EXISTS bookings_tenant_end_at_idx
  ON public.bookings (tenant_id, end_at);
