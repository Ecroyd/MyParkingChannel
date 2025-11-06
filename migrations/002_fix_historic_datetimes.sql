-- Migration: Fix historic rows that were stored incorrectly
-- Run this AFTER reviewing the preview query results

-- PREVIEW: Find rows that might have been imported incorrectly
-- Uncomment and run this first to see what would be affected:
/*
SELECT 
  id, 
  reference,
  start_at, 
  end_at, 
  start_at_local, 
  end_at_local,
  created_at,
  -- Show if times look suspicious (always midnight or near midnight in local time)
  extract(hour from start_at_local) as start_hour_local,
  extract(hour from end_at_local) as end_hour_local
FROM public.bookings
WHERE (
  extract(hour from start_at_local) IN (0, 1, 23) 
  OR extract(hour from end_at_local) IN (0, 1, 23)
)
  AND created_at < now() - interval '3 days'
ORDER BY created_at DESC
LIMIT 50;
*/

-- FIX: Convert "naively local" -> proper UTC (Europe/London aware)
-- ONLY run after confirming a sample!
-- Adjust the WHERE clause to target your specific problematic batch
/*
UPDATE public.bookings
SET
  start_at = (start_at AT TIME ZONE 'Europe/London') AT TIME ZONE 'UTC',
  end_at   = (end_at   AT TIME ZONE 'Europe/London') AT TIME ZONE 'UTC',
  updated_at = now()
WHERE 
  -- Tighten this predicate to your bad batch window
  created_at BETWEEN timestamp '2025-01-01' AND timestamp '2025-12-31'
  -- Add additional filters if needed, e.g.:
  -- AND tenant_id = 'specific-tenant-id'
  -- AND source = 'manual'
;
*/

-- Health check queries
-- Uncomment to run:

-- Check raw UTC spread looks sane
-- SELECT min(start_at), max(start_at) FROM public.bookings;

-- Compare UTC vs local now
-- SELECT now() AS utc_now, (now() AT TIME ZONE 'Europe/London') AS london_now;

-- Sanity: arrivals today (local)
/*
WITH bounds AS (
  SELECT (now() AT TIME ZONE 'Europe/London')::date AS d0
)
SELECT COUNT(*) 
FROM public.bookings b, bounds bd
WHERE b.start_at_local >= bd.d0
  AND b.start_at_local < (bd.d0 + interval '1 day');
*/

