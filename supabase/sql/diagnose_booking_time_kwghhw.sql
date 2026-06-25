-- Diagnose the one-hour display shift reported for booking KWGHHW.
-- The UI should prefer start_at_local/end_at_local for display and grouping.
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
