-- Temporary single-booking repair for KWGHHW (testing only).
-- Supplier-local arrival 14:00 / departure 18:00 on 2026-06-25 / 2026-06-29.

update public.bookings
set
  start_at = '2026-06-25 13:00:00+00',
  end_at = '2026-06-29 17:00:00+00',
  updated_at = now()
where reference = 'KWGHHW';

select
  reference,
  start_at,
  end_at,
  start_at at time zone 'Europe/London' as start_at_london,
  end_at at time zone 'Europe/London' as end_at_london,
  start_at_local,
  end_at_local
from public.bookings
where reference = 'KWGHHW';
