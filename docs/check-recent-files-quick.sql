-- Quick check: Did my recent files parse?
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. MOST RECENT FILES (Last 2 hours)
-- ============================================
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  CASE 
    WHEN f.parse_status = 'pending' THEN '⏳ Waiting to parse'
    WHEN f.parse_status = 'parsed' THEN '✅ Parsed successfully'
    WHEN f.parse_status = 'failed' THEN '❌ Parse failed'
    ELSE '❓ Unknown'
  END AS status_description,
  f.parse_error,
  f.parsed_at,
  f.created_at AS file_created,
  e.from_address,
  e.subject,
  -- Show booking count if parsed
  (SELECT COUNT(*) 
   FROM booking_import_staging s 
   WHERE s.source_email_id = e.id 
   AND s.source_filename = f.filename) AS staging_rows,
  (SELECT COUNT(*) 
   FROM bookings b
   JOIN booking_import_staging s ON s.tenant_id = b.tenant_id
     AND s.reference = b.reference
     AND s.vehicle_reg = b.plate
   WHERE s.source_email_id = e.id
   AND s.source_filename = f.filename) AS bookings_created
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.created_at > NOW() - INTERVAL '2 hours'
ORDER BY f.created_at DESC
LIMIT 20;

-- ============================================
-- 2. SUMMARY: How many files parsed?
-- ============================================
SELECT 
  f.parse_status,
  COUNT(*) AS file_count,
  STRING_AGG(f.filename, ', ' ORDER BY f.created_at DESC) AS filenames
FROM ingest_email_files f
WHERE f.created_at > NOW() - INTERVAL '2 hours'
GROUP BY f.parse_status
ORDER BY 
  CASE f.parse_status
    WHEN 'pending' THEN 1
    WHEN 'parsed' THEN 2
    WHEN 'failed' THEN 3
    ELSE 4
  END;

-- ============================================
-- 3. FILES WITH BOOKING COUNTS (Detailed)
-- ============================================
SELECT 
  f.filename,
  f.parse_status,
  f.parsed_at,
  e.from_address,
  e.subject,
  COUNT(DISTINCT s.id) AS staging_rows,
  COUNT(DISTINCT b.id) AS bookings_created,
  SUM(b.money_charged) AS total_revenue
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
LEFT JOIN booking_import_staging s ON s.source_email_id = e.id
  AND s.source_filename = f.filename
LEFT JOIN bookings b ON b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
  AND ABS(EXTRACT(EPOCH FROM (b.start_at - s.start_at))) < 60
WHERE f.created_at > NOW() - INTERVAL '2 hours'
GROUP BY f.id, f.filename, f.parse_status, f.parsed_at, e.from_address, e.subject
ORDER BY f.created_at DESC;
