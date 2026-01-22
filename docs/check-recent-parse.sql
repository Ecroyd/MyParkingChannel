-- Check if a file that disappeared from pending was actually parsed successfully
-- Run this in Supabase SQL Editor

-- 1. Find the most recent file (even if it's now "parsed")
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parse_error,
  f.parsed_at,
  f.created_at AS file_created,
  e.id AS email_id,
  e.from_address,
  e.subject,
  e.created_at AS email_received
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.created_at > NOW() - INTERVAL '1 hour'
ORDER BY f.created_at DESC
LIMIT 10;

-- 2. Check staging rows for recent emails
SELECT 
  s.id,
  s.reference,
  s.customer_name,
  s.vehicle_reg,
  s.start_at,
  s.end_at,
  s.total_price,
  s.created_at,
  s.source_email_id,
  e.from_address,
  e.subject
FROM booking_import_staging s
LEFT JOIN ingest_emails e ON e.id = s.source_email_id
WHERE s.created_at > NOW() - INTERVAL '1 hour'
ORDER BY s.created_at DESC
LIMIT 20;

-- 3. Check bookings created in the last hour WITH SOURCE TRACING
SELECT 
  b.id,
  b.reference,
  b.customer_name,
  b.plate,
  b.start_at,
  b.end_at,
  b.money_charged,
  b.source,
  b.external_source,
  b.created_at,
  b.tenant_id,
  -- Source file/email info
  f.filename AS source_filename,
  e.from_address AS source_email,
  e.subject AS source_subject,
  e.created_at AS email_received
FROM bookings b
LEFT JOIN booking_import_staging s ON s.tenant_id = b.tenant_id
  AND s.reference = b.reference
  AND s.vehicle_reg = b.plate
  AND ABS(EXTRACT(EPOCH FROM (s.start_at - b.start_at))) < 60
LEFT JOIN ingest_emails e ON e.id = s.source_email_id
LEFT JOIN ingest_email_files f ON f.email_id = e.id
WHERE b.created_at > NOW() - INTERVAL '1 hour'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
ORDER BY b.created_at DESC
LIMIT 20;

-- 4. Full pipeline check: Email → File → Staging → Booking
SELECT 
  e.id AS email_id,
  e.from_address,
  e.subject,
  e.created_at AS email_received,
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parsed_at,
  COUNT(DISTINCT s.id) AS staging_rows,
  COUNT(DISTINCT b.id) AS bookings_created
FROM ingest_emails e
LEFT JOIN ingest_email_files f ON f.email_id = e.id
LEFT JOIN booking_import_staging s ON s.source_email_id = e.id
LEFT JOIN bookings b ON b.created_at BETWEEN f.parsed_at - INTERVAL '1 minute' AND f.parsed_at + INTERVAL '10 minutes'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
  AND b.external_source LIKE '%APH%'
WHERE e.created_at > NOW() - INTERVAL '1 hour'
GROUP BY e.id, e.from_address, e.subject, e.created_at, f.id, f.filename, f.parse_status, f.parsed_at
ORDER BY e.created_at DESC;

-- 5. Quick summary of what happened
SELECT 
  'Files created' AS step,
  COUNT(*) AS count
FROM ingest_email_files
WHERE created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
  'Files parsed' AS step,
  COUNT(*) AS count
FROM ingest_email_files
WHERE parse_status = 'parsed'
  AND created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
  'Staging rows' AS step,
  COUNT(*) AS count
FROM booking_import_staging
WHERE created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
  'Bookings created' AS step,
  COUNT(*) AS count
FROM bookings
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
  AND external_source LIKE '%APH%';
