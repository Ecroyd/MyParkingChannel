-- Run this before adding unique index on (tenant_id, reference).
-- Result must be 0 rows. If any rows are returned, run admin_dedupe_bookings.sql first.
SELECT tenant_id, reference, count(*) AS cnt
FROM public.bookings
WHERE reference IS NOT NULL
GROUP BY tenant_id, reference
HAVING count(*) > 1;
