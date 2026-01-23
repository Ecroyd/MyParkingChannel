-- Verify parsed files and their source attribution
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. RECENT PARSED FILES WITH SOURCE INFO
-- ============================================
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parsed_at,
  f.created_at AS file_created,
  e.from_address,
  e.subject,
  e.created_at AS email_received,
  -- Get channel from staging raw_json
  (SELECT s.raw_json->>'channel' 
   FROM booking_import_staging s 
   WHERE s.source_email_id = e.id 
   AND s.source_filename = f.filename 
   LIMIT 1) AS detected_channel,
  -- Get source from staging
  (SELECT s.source 
   FROM booking_import_staging s 
   WHERE s.source_email_id = e.id 
   AND s.source_filename = f.filename 
   LIMIT 1) AS staging_source,
  -- Get external_source from bookings
  (SELECT b.external_source 
   FROM bookings b
   JOIN booking_import_staging s ON s.tenant_id = b.tenant_id
     AND s.reference = b.reference
     AND s.vehicle_reg = b.plate
   WHERE s.source_email_id = e.id
   AND s.source_filename = f.filename
   LIMIT 1) AS booking_external_source,
  -- Get source from bookings
  (SELECT b.source 
   FROM bookings b
   JOIN booking_import_staging s ON s.tenant_id = b.tenant_id
     AND s.reference = b.reference
     AND s.vehicle_reg = b.plate
   WHERE s.source_email_id = e.id
   AND s.source_filename = f.filename
   LIMIT 1) AS booking_source,
  -- Count bookings created
  (SELECT COUNT(*) 
   FROM bookings b
   JOIN booking_import_staging s ON s.tenant_id = b.tenant_id
     AND s.reference = b.reference
     AND s.vehicle_reg = b.plate
   WHERE s.source_email_id = e.id
   AND s.source_filename = f.filename) AS bookings_created
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.parse_status = 'parsed'
  AND f.parsed_at > NOW() - INTERVAL '7 days'
ORDER BY f.parsed_at DESC
LIMIT 50;

-- ============================================
-- 2. SOURCE VERIFICATION: Check for mismatches
-- ============================================
-- This shows files where the detected channel doesn't match the booking source
SELECT 
  f.filename,
  f.parsed_at,
  e.from_address,
  s.raw_json->>'channel' AS detected_channel,
  s.source AS staging_source,
  b.source AS booking_source,
  b.external_source,
  b.reference,
  b.plate,
  b.created_at AS booking_created,
  -- Flag potential issues
  CASE 
    WHEN s.raw_json->>'channel' = 'CAVU' AND b.source != 'cavu' THEN '⚠️ CAVU file tagged as ' || b.source
    WHEN s.raw_json->>'channel' = 'HOLIDAY_EXTRAS' AND b.source != 'holidayextras' THEN '⚠️ Holiday Extras tagged as ' || b.source
    WHEN s.raw_json->>'channel' = 'APH' AND b.external_source != 'APH Email Import' THEN '⚠️ APH file tagged as ' || b.external_source
    WHEN s.raw_json->>'channel' = 'FLYPARKS_EMAIL' AND b.external_source != 'Flyparks Email Import' THEN '⚠️ Flyparks tagged as ' || b.external_source
    ELSE '✅ Correct'
  END AS source_status
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
JOIN booking_import_staging s ON s.source_email_id = e.id
  AND s.source_filename = f.filename
JOIN bookings b ON b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
WHERE f.parse_status = 'parsed'
  AND f.parsed_at > NOW() - INTERVAL '7 days'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
ORDER BY f.parsed_at DESC;

-- ============================================
-- 3. SUMMARY BY CHANNEL/SOURCE
-- ============================================
SELECT 
  s.raw_json->>'channel' AS detected_channel,
  b.source AS booking_source,
  b.external_source,
  COUNT(DISTINCT f.id) AS file_count,
  COUNT(DISTINCT b.id) AS booking_count,
  SUM(b.money_charged) AS total_revenue
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
JOIN booking_import_staging s ON s.source_email_id = e.id
  AND s.source_filename = f.filename
JOIN bookings b ON b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
WHERE f.parse_status = 'parsed'
  AND f.parsed_at > NOW() - INTERVAL '7 days'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
GROUP BY s.raw_json->>'channel', b.source, b.external_source
ORDER BY booking_count DESC;

-- ============================================
-- 4. FILES WITH INCORRECT SOURCE ATTRIBUTION
-- ============================================
-- This highlights files that need attention
SELECT 
  f.id AS file_id,
  f.filename,
  f.parsed_at,
  e.from_address,
  s.raw_json->>'channel' AS detected_channel,
  b.source AS booking_source,
  b.external_source,
  COUNT(b.id) AS booking_count,
  STRING_AGG(b.reference, ', ') AS sample_references
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
JOIN booking_import_staging s ON s.source_email_id = e.id
  AND s.source_filename = f.filename
JOIN bookings b ON b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
WHERE f.parse_status = 'parsed'
  AND f.parsed_at > NOW() - INTERVAL '7 days'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
  AND (
    (s.raw_json->>'channel' = 'CAVU' AND b.source != 'cavu') OR
    (s.raw_json->>'channel' = 'HOLIDAY_EXTRAS' AND b.source != 'holidayextras') OR
    (s.raw_json->>'channel' = 'APH' AND b.external_source != 'APH Email Import') OR
    (s.raw_json->>'channel' = 'FLYPARKS_EMAIL' AND b.external_source != 'Flyparks Email Import')
  )
GROUP BY f.id, f.filename, f.parsed_at, e.from_address, s.raw_json->>'channel', b.source, b.external_source
ORDER BY f.parsed_at DESC;

-- ============================================
-- 5. RECENT BOOKINGS WITH SOURCE TRACE
-- ============================================
-- See the last 20 bookings and trace back to their source files
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
  f.filename AS source_file,
  f.parsed_at AS file_parsed_at,
  e.from_address AS email_from,
  s.raw_json->>'channel' AS detected_channel,
  -- Verify source is correct
  CASE 
    WHEN s.raw_json->>'channel' = 'CAVU' AND b.source = 'cavu' AND b.external_source = 'CAVU Email Import' THEN '✅ Correct'
    WHEN s.raw_json->>'channel' = 'HOLIDAY_EXTRAS' AND b.source = 'holidayextras' AND b.external_source = 'Holiday Extras Email Import' THEN '✅ Correct'
    WHEN s.raw_json->>'channel' = 'APH' AND b.source = 'other' AND b.external_source = 'APH Email Import' THEN '✅ Correct'
    WHEN s.raw_json->>'channel' = 'FLYPARKS_EMAIL' AND b.source = 'other' AND b.external_source = 'Flyparks Email Import' THEN '✅ Correct'
    ELSE '⚠️ Check source'
  END AS verification
FROM bookings b
JOIN booking_import_staging s ON s.tenant_id = b.tenant_id
  AND s.reference = b.reference
  AND s.vehicle_reg = b.plate
JOIN ingest_emails e ON e.id = s.source_email_id
JOIN ingest_email_files f ON f.email_id = e.id
  AND f.filename = s.source_filename
WHERE b.created_at > NOW() - INTERVAL '7 days'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
ORDER BY b.created_at DESC
LIMIT 20;
