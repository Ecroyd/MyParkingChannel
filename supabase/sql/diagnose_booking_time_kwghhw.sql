-- Diagnose booking KWGHHW timezone storage vs Europe/London display.
-- UI displays start_at/end_at once in tenant timezone (not start_at_local).
select
  id,
  tenant_id,
  reference,
  start_at,
  end_at,
  start_at_local,
  end_at_local,
  start_at at time zone 'Europe/London' as start_at_europe_london,
  end_at at time zone 'Europe/London' as end_at_europe_london,
  gate_status,
  status,
  updated_at
from public.bookings
where reference = 'KWGHHW';
