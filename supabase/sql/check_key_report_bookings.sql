-- Run this in Supabase SQL Editor to see which bookings have Take Key / Arrived & Key Taken.
-- Key Report now filters by gate_status (same as Today page dropdown).

-- Bookings with gate_status = take_key or arrived_key_taken (what Key Report uses)
SELECT id, tenant_id, reference, plate, start_at, end_at, gate_status, ops_status, highlight_code, status
FROM bookings
WHERE gate_status IN ('take_key', 'arrived_key_taken')
ORDER BY start_at DESC
LIMIT 50;

-- Optional: count by gate_status
-- SELECT gate_status, COUNT(*) FROM bookings WHERE gate_status IN ('take_key', 'arrived_key_taken') GROUP BY gate_status;

-- Optional: if you previously had ops_status set (different UI), compare
-- SELECT id, reference, gate_status, ops_status FROM bookings WHERE ops_status IN ('take_key', 'arrived_key_taken') OR gate_status IN ('take_key', 'arrived_key_taken');
