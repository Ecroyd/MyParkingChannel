-- Check if auto-parse worked: Email → File → Import → Booking
-- Run these queries in Supabase SQL Editor

-- ============================================
-- 1. RECENT EMAILS (Last 1 hour)
-- ============================================
SELECT 
  e.id AS email_id,
  e.created_at AS email_received,
  e.from_address,
  e.subject,
  LENGTH(e.raw_rfc822_base64) AS email_size_bytes
FROM ingest_emails e
WHERE e.created_at > NOW() - INTERVAL '1 hour'
ORDER BY e.created_at DESC;

-- ============================================
-- 2. FILES FROM RECENT EMAILS
-- ============================================
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
ORDER BY f.created_at DESC;

-- ============================================
-- 3. IMPORT RUNS (if files were parsed)
-- ============================================
SELECT 
  ir.id AS import_run_id,
  ir.tenant_id,
  ir.profile_name,
  ir.inserted_count AS bookings_inserted,
  ir.error_count,
  ir.created_at AS import_time
FROM import_runs ir
WHERE ir.created_at > NOW() - INTERVAL '1 hour'
ORDER BY ir.created_at DESC;

-- ============================================
-- 4. BOOKINGS CREATED (Last 1 hour)
-- ============================================
SELECT 
  b.id,
  b.reference,
  b.customer_name,
  b.start_at,
  b.end_at,
  b.source,
  b.created_at,
  b.tenant_id
FROM bookings b
WHERE b.created_at > NOW() - INTERVAL '1 hour'
ORDER BY b.created_at DESC
LIMIT 50;

-- ============================================
-- 5. FULL PIPELINE STATUS (Email → File → Import → Booking)
-- ============================================
SELECT 
  e.id AS email_id,
  e.created_at AS email_received,
  e.from_address,
  e.subject,
  -- File info
  f.id AS file_id,
  f.filename,
  f.parse_status AS file_status,
  f.parsed_at,
  -- Import run info (linked by time - import run created within 5 min of file parse)
  ir.id AS import_run_id,
  ir.inserted_count AS bookings_imported,
  ir.error_count AS import_errors,
  ir.created_at AS import_time,
  -- Booking count
  (SELECT COUNT(*) 
   FROM bookings b 
   WHERE b.created_at BETWEEN f.parsed_at AND f.parsed_at + INTERVAL '1 hour'
     AND b.tenant_id = COALESCE(ir.tenant_id, (SELECT tenant_id FROM tenants LIMIT 1))
  ) AS bookings_created_count
FROM ingest_emails e
LEFT JOIN ingest_email_files f ON f.email_id = e.id
LEFT JOIN import_runs ir ON ir.created_at BETWEEN f.parsed_at - INTERVAL '5 minutes' AND f.parsed_at + INTERVAL '5 minutes'
  AND ir.profile_name LIKE '%Email import%'
WHERE e.created_at > NOW() - INTERVAL '1 hour'
ORDER BY e.created_at DESC;

-- ============================================
-- 6. QUICK SUMMARY (Last 1 hour)
-- ============================================
SELECT 
  'Emails received' AS step,
  COUNT(*) AS count,
  MAX(created_at) AS latest
FROM ingest_emails
WHERE created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
  'Files stored' AS step,
  COUNT(*) AS count,
  MAX(created_at) AS latest
FROM ingest_email_files
WHERE created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
  'Files parsed' AS step,
  COUNT(*) AS count,
  MAX(parsed_at) AS latest
FROM ingest_email_files
WHERE parse_status = 'parsed'
  AND created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
  'Import runs' AS step,
  COUNT(*) AS count,
  MAX(created_at) AS latest
FROM import_runs
WHERE created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
  'Bookings created' AS step,
  COUNT(*) AS count,
  MAX(created_at) AS latest
FROM bookings
WHERE created_at > NOW() - INTERVAL '1 hour';

-- ============================================
-- 7. CHECK SPECIFIC TENANT (bab45dab-19e8-4230-b18e-ee1f663608e5)
-- ============================================
SELECT 
  'Total bookings for tenant' AS metric,
  COUNT(*) AS count
FROM bookings
WHERE tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
  AND created_at > NOW() - INTERVAL '1 hour'

UNION ALL

SELECT 
  'Import runs for tenant' AS metric,
  COUNT(*) AS count
FROM import_runs
WHERE tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
  AND created_at > NOW() - INTERVAL '1 hour';

-- ============================================
-- 8. FILES STILL PENDING (should be 0 if auto-parse worked)
-- ============================================
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.created_at,
  e.from_address,
  e.subject
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.parse_status = 'pending'
  AND f.created_at > NOW() - INTERVAL '1 hour'
ORDER BY f.created_at DESC;
