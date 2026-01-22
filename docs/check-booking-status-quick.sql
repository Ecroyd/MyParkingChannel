-- Quick Status Check: Email → File → Booking Pipeline
-- Run this in Supabase SQL Editor

-- ============================================
-- CURRENT STATUS (Your Recent Email)
-- ============================================
SELECT 
  e.id AS email_id,
  e.created_at AS email_received,
  e.subject,
  e.from_address,
  LENGTH(e.raw_rfc822_base64) AS email_size_bytes,
  -- File status
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parse_error,
  f.parsed_at,
  -- Import run (if file was processed)
  ir.id AS import_run_id,
  ir.inserted_count AS bookings_imported,
  ir.error_count AS import_errors,
  ir.created_at AS import_time
FROM ingest_emails e
LEFT JOIN ingest_email_files f ON f.email_id = e.id
LEFT JOIN import_runs ir ON ir.created_at BETWEEN f.created_at AND f.created_at + INTERVAL '2 hours'
WHERE e.id = '10aed004-1b0d-4d09-9f03-c5b20bc2de4d'  -- Your recent email ID
ORDER BY e.created_at DESC;

-- ============================================
-- CHECK IF BOOKINGS WERE CREATED
-- ============================================
-- Look for bookings created around the time the file was parsed
SELECT 
  b.id,
  b.reference,
  b.customer_name,
  b.start_at,
  b.end_at,
  b.source,
  b.created_at,
  b.notes
FROM bookings b
WHERE b.created_at > '2026-01-22 10:12:00'  -- After your email was received
ORDER BY b.created_at DESC
LIMIT 20;

-- ============================================
-- SUMMARY: What's the current state?
-- ============================================
SELECT 
  'Email received' AS step,
  COUNT(*) AS count,
  MAX(created_at) AS latest
FROM ingest_emails
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'Files stored' AS step,
  COUNT(*) AS count,
  MAX(created_at) AS latest
FROM ingest_email_files
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'Files parsed' AS step,
  COUNT(*) AS count,
  MAX(parsed_at) AS latest
FROM ingest_email_files
WHERE parse_status = 'parsed'
  AND created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'Import runs' AS step,
  COUNT(*) AS count,
  MAX(created_at) AS latest
FROM import_runs
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'Bookings created (last 24h)' AS step,
  COUNT(*) AS count,
  MAX(created_at) AS latest
FROM bookings
WHERE created_at > NOW() - INTERVAL '24 hours';
