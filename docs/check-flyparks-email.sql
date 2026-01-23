-- Check if a Flyparks email was processed correctly
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. RECENT FLYPARKS EMAILS (Last 1 hour)
-- ============================================
SELECT 
  e.id AS email_id,
  e.from_address,
  e.subject,
  e.created_at AS email_received,
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parse_error,
  f.parsed_at,
  CASE 
    WHEN f.parse_status = 'pending' THEN '⏳ Waiting to parse'
    WHEN f.parse_status = 'parsed' THEN '✅ Parsed successfully'
    WHEN f.parse_status = 'failed' THEN '❌ Parse failed'
    ELSE '❓ Unknown'
  END AS status_description
FROM ingest_emails e
LEFT JOIN ingest_email_files f ON f.email_id = e.id
WHERE e.created_at > NOW() - INTERVAL '1 hour'
  AND (
    e.subject ILIKE '%flyparks%' 
    OR e.subject ILIKE '%booking%'
    OR f.filename = 'email-body.txt'
  )
ORDER BY e.created_at DESC;

-- ============================================
-- 2. CHECK STAGING ROWS FROM FLYPARKS EMAILS
-- ============================================
SELECT 
  s.id AS staging_id,
  s.reference,
  s.customer_name,
  s.vehicle_reg,
  s.start_at,
  s.end_at,
  s.total_price,
  s.source,
  s.external_reference,
  s.created_at AS staged_at,
  e.from_address,
  e.subject,
  f.filename AS source_file
FROM booking_import_staging s
JOIN ingest_emails e ON e.id = s.source_email_id
LEFT JOIN ingest_email_files f ON f.email_id = e.id
  AND f.filename = s.source_filename
WHERE s.created_at > NOW() - INTERVAL '1 hour'
  AND (
    s.source = 'other' AND s.raw_json->>'channel' = 'FLYPARKS_EMAIL'
    OR f.filename = 'email-body.txt'
    OR e.subject ILIKE '%flyparks%'
  )
ORDER BY s.created_at DESC;

-- ============================================
-- 3. CHECK BOOKINGS FROM FLYPARKS EMAILS
-- ============================================
SELECT 
  b.id AS booking_id,
  b.reference,
  b.customer_name,
  b.plate,
  b.start_at,
  b.end_at,
  b.money_charged,
  b.source,
  b.external_source,
  b.created_at AS booking_created,
  e.from_address AS source_email,
  e.subject AS email_subject,
  f.filename AS source_file
FROM bookings b
LEFT JOIN booking_import_staging s ON s.tenant_id = b.tenant_id
  AND s.reference = b.reference
  AND s.vehicle_reg = b.plate
  AND ABS(EXTRACT(EPOCH FROM (s.start_at - b.start_at))) < 60
LEFT JOIN ingest_emails e ON e.id = s.source_email_id
LEFT JOIN ingest_email_files f ON f.email_id = e.id
  AND f.filename = s.source_filename
WHERE b.created_at > NOW() - INTERVAL '1 hour'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
  AND (
    b.external_source ILIKE '%flyparks%'
    OR f.filename = 'email-body.txt'
  )
ORDER BY b.created_at DESC;

-- ============================================
-- 4. FULL PIPELINE CHECK FOR MOST RECENT EMAIL
-- ============================================
-- Shows the complete flow: Email → File → Staging → Booking
SELECT 
  e.id AS email_id,
  e.from_address,
  e.subject,
  e.created_at AS email_received,
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parse_error,
  f.parsed_at,
  COUNT(DISTINCT s.id) AS staging_rows,
  COUNT(DISTINCT b.id) AS bookings_created,
  STRING_AGG(DISTINCT b.reference, ', ' ORDER BY b.reference) AS booking_references
FROM ingest_emails e
LEFT JOIN ingest_email_files f ON f.email_id = e.id
LEFT JOIN booking_import_staging s ON s.source_email_id = e.id
  AND s.source_filename = f.filename
LEFT JOIN bookings b ON b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
  AND ABS(EXTRACT(EPOCH FROM (b.start_at - s.start_at))) < 60
WHERE e.created_at > NOW() - INTERVAL '1 hour'
  AND (
    e.subject ILIKE '%flyparks%'
    OR f.filename = 'email-body.txt'
  )
GROUP BY e.id, e.from_address, e.subject, e.created_at, f.id, f.filename, f.parse_status, f.parse_error, f.parsed_at
ORDER BY e.created_at DESC;

-- ============================================
-- 5. QUICK STATUS: Did it work?
-- ============================================
SELECT 
  'Email received' AS step,
  COUNT(*) AS count,
  MAX(created_at) AS latest
FROM ingest_emails
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND (subject ILIKE '%flyparks%' OR from_address ILIKE '%flyparks%')

UNION ALL

SELECT 
  'File created' AS step,
  COUNT(*) AS count,
  MAX(created_at) AS latest
FROM ingest_email_files
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND filename = 'email-body.txt'

UNION ALL

SELECT 
  'File parsed' AS step,
  COUNT(*) AS count,
  MAX(parsed_at) AS latest
FROM ingest_email_files
WHERE parse_status = 'parsed'
  AND created_at > NOW() - INTERVAL '1 hour'
  AND filename = 'email-body.txt'

UNION ALL

SELECT 
  'Staging rows' AS step,
  COUNT(*) AS count,
  MAX(created_at) AS latest
FROM booking_import_staging
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND source_email_id IN (
    SELECT id FROM ingest_emails 
    WHERE created_at > NOW() - INTERVAL '1 hour'
    AND (subject ILIKE '%flyparks%' OR from_address ILIKE '%flyparks%')
  )

UNION ALL

SELECT 
  'Bookings created' AS step,
  COUNT(*) AS count,
  MAX(created_at) AS latest
FROM bookings
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
  AND external_source ILIKE '%flyparks%';
