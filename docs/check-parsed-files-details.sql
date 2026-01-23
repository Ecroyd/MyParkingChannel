-- Check why parsed files show 0 bookings
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. CHECK STAGING FOR RECENT PARSED FILES
-- ============================================
-- This will show if staging rows were actually created
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
WHERE s.created_at > NOW() - INTERVAL '2 hours'
ORDER BY s.created_at DESC;

-- ============================================
-- 2. CHECK BOOKINGS FROM RECENT PARSED FILES
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
WHERE b.created_at > NOW() - INTERVAL '2 hours'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
ORDER BY b.created_at DESC;

-- ============================================
-- 3. CHECK SPECIFIC FILES: What happened?
-- ============================================
-- Replace with your file IDs from the status query
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parse_error,
  f.parsed_at,
  e.id AS email_id,
  e.from_address,
  e.subject,
  -- Count staging rows for this specific file
  (SELECT COUNT(*) 
   FROM booking_import_staging s 
   WHERE s.source_email_id = e.id 
   AND s.source_filename = f.filename) AS actual_staging_count,
  -- Count bookings for this specific file
  (SELECT COUNT(*) 
   FROM bookings b
   JOIN booking_import_staging s ON s.tenant_id = b.tenant_id
     AND s.reference = b.reference
     AND s.vehicle_reg = b.plate
   WHERE s.source_email_id = e.id
   AND s.source_filename = f.filename) AS actual_booking_count
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.id IN (
  '61710715-0082-4652-a79e-9825cbddf4be',  -- APH.csv .txt
  '6df2256d-60d8-46af-a30f-44da62d52a84',  -- ext1180126.txt
  'ae26512b-8418-4559-918f-0d0c2c764c87'   -- 27_HOURLY_20260118_200042.csv
)
ORDER BY f.created_at DESC;

-- ============================================
-- 4. CHECK STAGING FOR THESE SPECIFIC EMAILS
-- ============================================
SELECT 
  s.id,
  s.reference,
  s.customer_name,
  s.vehicle_reg,
  s.start_at,
  s.end_at,
  s.source,
  s.external_reference,
  s.source_filename,
  s.created_at,
  e.subject AS email_subject
FROM booking_import_staging s
JOIN ingest_emails e ON e.id = s.source_email_id
WHERE e.id IN (
  SELECT email_id FROM ingest_email_files 
  WHERE id IN (
    '61710715-0082-4652-a79e-9825cbddf4be',
    '6df2256d-60d8-46af-a30f-44da62d52a84',
    'ae26512b-8418-4559-918f-0d0c2c764c87'
  )
)
ORDER BY s.created_at DESC;
