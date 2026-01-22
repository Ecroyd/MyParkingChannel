-- Check bookings created from parsed email files
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. BOOKINGS FROM RECENT PARSED FILES (Detailed)
-- ============================================
-- Shows all bookings created from files parsed in the last 24 hours
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parsed_at,
  e.from_address,
  e.subject,
  b.id AS booking_id,
  b.reference,
  b.customer_name,
  b.plate AS vehicle_reg,
  b.start_at,
  b.end_at,
  b.money_charged,
  b.source,
  b.external_source,
  b.created_at AS booking_created
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
LEFT JOIN booking_import_staging s ON s.source_email_id = e.id
LEFT JOIN bookings b ON b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
  AND ABS(EXTRACT(EPOCH FROM (b.start_at - s.start_at))) < 60
WHERE f.parse_status = 'parsed'
  AND f.parsed_at > NOW() - INTERVAL '24 hours'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
ORDER BY f.parsed_at DESC, b.created_at DESC;

-- ============================================
-- 2. SUMMARY: BOOKINGS PER FILE
-- ============================================
-- Quick overview of how many bookings each file created
SELECT 
  f.id AS file_id,
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
LEFT JOIN bookings b ON b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
WHERE f.parse_status = 'parsed'
  AND f.parsed_at > NOW() - INTERVAL '24 hours'
GROUP BY f.id, f.filename, f.parse_status, f.parsed_at, e.from_address, e.subject
ORDER BY f.parsed_at DESC;

-- ============================================
-- 3. ALL RECENT BOOKINGS WITH SOURCE FILE
-- ============================================
-- Shows all bookings created in last 24 hours, linked to their source files
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
  b.created_at,
  f.filename AS source_file,
  e.from_address AS source_email,
  e.subject AS email_subject
FROM bookings b
LEFT JOIN booking_import_staging s ON s.tenant_id = b.tenant_id
  AND s.reference = b.reference
  AND s.vehicle_reg = b.plate
  AND ABS(EXTRACT(EPOCH FROM (s.start_at - b.start_at))) < 60
LEFT JOIN ingest_emails e ON e.id = s.source_email_id
LEFT JOIN ingest_email_files f ON f.email_id = e.id
WHERE b.created_at > NOW() - INTERVAL '24 hours'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
ORDER BY b.created_at DESC
LIMIT 100;

-- ============================================
-- 4. BOOKINGS BY SOURCE CHANNEL (Billing Check)
-- ============================================
-- Verify bookings are correctly tagged by source for billing
SELECT 
  b.source,
  b.external_source,
  COUNT(*) AS booking_count,
  SUM(b.money_charged) AS total_revenue,
  MIN(b.created_at) AS first_booking,
  MAX(b.created_at) AS last_booking
FROM bookings b
WHERE b.created_at > NOW() - INTERVAL '24 hours'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
GROUP BY b.source, b.external_source
ORDER BY booking_count DESC;

-- ============================================
-- 5. SPECIFIC FILE: See all bookings from one file
-- ============================================
-- Replace 'YOUR_FILE_ID' with the file_id from the status query
SELECT 
  f.filename,
  f.parse_status,
  f.parsed_at,
  b.id AS booking_id,
  b.reference,
  b.customer_name,
  b.plate,
  b.start_at,
  b.end_at,
  b.money_charged,
  b.source,
  b.external_source,
  s.external_reference,
  s.external_status
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
LEFT JOIN booking_import_staging s ON s.source_email_id = e.id
LEFT JOIN bookings b ON b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
WHERE f.id = 'f5fb1d5f-213d-421f-9990-3e91d6e88fe9'  -- Replace with your file_id
ORDER BY b.created_at DESC;
