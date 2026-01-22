-- Check if bookings were imported from email attachments
-- Run these queries in Supabase SQL Editor

-- ============================================
-- 1. CHECK FILE STATUS AND PARSING
-- ============================================
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parse_error,
  f.parsed_at,
  f.created_at AS file_created,
  e.id AS email_id,
  e.subject,
  e.from_address,
  e.created_at AS email_received
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.created_at > NOW() - INTERVAL '24 hours'
ORDER BY f.created_at DESC;

-- ============================================
-- 2. CHECK IF FILE WAS PARSED
-- ============================================
SELECT 
  f.id,
  f.filename,
  f.parse_status,
  CASE 
    WHEN f.parse_status = 'pending' THEN '⚠️ Waiting to be parsed'
    WHEN f.parse_status = 'parsed' THEN '✅ Parsed successfully'
    WHEN f.parse_status = 'failed' THEN '❌ Parse failed'
    ELSE '❓ Unknown status'
  END AS status_description,
  f.parse_error,
  f.parsed_at,
  e.subject AS email_subject
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.created_at > NOW() - INTERVAL '24 hours'
ORDER BY f.created_at DESC;

-- ============================================
-- 3. CHECK IMPORT RUNS (if file was processed)
-- ============================================
SELECT 
  ir.id AS import_run_id,
  ir.profile_name,
  ir.inserted_count AS bookings_inserted,
  ir.skipped_duplicates,
  ir.error_count,
  ir.created_at AS import_run_time,
  -- Try to link to email file (adjust based on your schema)
  ir.meta
FROM import_runs ir
WHERE ir.created_at > NOW() - INTERVAL '24 hours'
ORDER BY ir.created_at DESC;

-- ============================================
-- 4. CHECK RECENT BOOKINGS (by source)
-- ============================================
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
WHERE b.created_at > NOW() - INTERVAL '24 hours'
  AND (b.source LIKE '%email%' OR b.source LIKE '%import%' OR b.notes LIKE '%email%')
ORDER BY b.created_at DESC
LIMIT 50;

-- ============================================
-- 5. FULL PIPELINE STATUS (Email → File → Import → Booking)
-- ============================================
SELECT 
  e.id AS email_id,
  e.created_at AS email_received,
  e.subject,
  e.from_address,
  -- File info
  f.id AS file_id,
  f.filename,
  f.parse_status AS file_status,
  f.parsed_at,
  -- Import run info
  ir.id AS import_run_id,
  ir.inserted_count AS bookings_imported,
  ir.error_count AS import_errors,
  ir.created_at AS import_time,
  -- Booking count (if linked via notes or metadata)
  (SELECT COUNT(*) 
   FROM bookings b 
   WHERE b.created_at BETWEEN f.parsed_at AND f.parsed_at + INTERVAL '1 hour'
     AND b.source IN ('email_import', 'import', 'manual')
  ) AS potential_bookings_count
FROM ingest_emails e
LEFT JOIN ingest_email_files f ON f.email_id = e.id
LEFT JOIN import_runs ir ON ir.created_at BETWEEN f.parsed_at AND f.parsed_at + INTERVAL '1 hour'
WHERE e.created_at > NOW() - INTERVAL '24 hours'
ORDER BY e.created_at DESC;

-- ============================================
-- 6. QUICK STATUS CHECK (Summary)
-- ============================================
SELECT 
  COUNT(DISTINCT e.id) AS total_emails,
  COUNT(DISTINCT f.id) AS total_files,
  COUNT(DISTINCT CASE WHEN f.parse_status = 'pending' THEN f.id END) AS files_pending,
  COUNT(DISTINCT CASE WHEN f.parse_status = 'parsed' THEN f.id END) AS files_parsed,
  COUNT(DISTINCT CASE WHEN f.parse_status = 'failed' THEN f.id END) AS files_failed,
  COUNT(DISTINCT ir.id) AS import_runs,
  COALESCE(SUM(ir.inserted_count), 0) AS total_bookings_imported
FROM ingest_emails e
LEFT JOIN ingest_email_files f ON f.email_id = e.id
LEFT JOIN import_runs ir ON ir.created_at > e.created_at - INTERVAL '1 hour'
WHERE e.created_at > NOW() - INTERVAL '24 hours';
