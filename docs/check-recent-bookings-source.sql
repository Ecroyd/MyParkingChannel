-- Check recent bookings and trace them back to source files/emails
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. RECENT BOOKINGS WITH SOURCE TRACING
-- ============================================
-- Shows bookings created in last 24 hours with full source chain
SELECT 
  b.id AS booking_id,
  b.reference,
  b.customer_name,
  b.plate AS vehicle_reg,
  b.start_at,
  b.end_at,
  b.money_charged,
  b.source,
  b.external_source,
  b.created_at AS booking_created,
  -- Source file info
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parsed_at,
  -- Email info
  e.id AS email_id,
  e.from_address,
  e.subject,
  e.created_at AS email_received,
  -- Staging link
  s.id AS staging_id,
  s.source_filename AS staging_filename
FROM bookings b
LEFT JOIN booking_import_staging s ON s.tenant_id = b.tenant_id
  AND s.reference = b.reference
  AND s.vehicle_reg = b.plate
  AND ABS(EXTRACT(EPOCH FROM (s.start_at - b.start_at))) < 60 -- Within 1 minute
LEFT JOIN ingest_emails e ON e.id = s.source_email_id
LEFT JOIN ingest_email_files f ON f.email_id = e.id
WHERE b.created_at > NOW() - INTERVAL '24 hours'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
ORDER BY b.created_at DESC
LIMIT 50;

-- ============================================
-- 2. BOOKINGS BY SOURCE CHANNEL (Summary)
-- ============================================
-- Group bookings by their source channel for billing verification
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
-- 3. EMAIL → FILE → BOOKING CHAIN (Detailed)
-- ============================================
-- Full trace from email receipt to booking creation
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
  COUNT(DISTINCT b.id) AS bookings_created,
  STRING_AGG(DISTINCT b.reference, ', ' ORDER BY b.reference) AS booking_references,
  STRING_AGG(DISTINCT b.external_source, ', ') AS booking_sources
FROM ingest_emails e
LEFT JOIN ingest_email_files f ON f.email_id = e.id
LEFT JOIN booking_import_staging s ON s.source_email_id = e.id
LEFT JOIN bookings b ON b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
  AND ABS(EXTRACT(EPOCH FROM (b.start_at - s.start_at))) < 60
WHERE e.created_at > NOW() - INTERVAL '24 hours'
  AND e.from_address IN ('jcecroyd@gmail.com', 'info@flyparksexeter.co.uk')
GROUP BY e.id, e.from_address, e.subject, e.created_at, f.id, f.filename, f.parse_status, f.parsed_at
ORDER BY e.created_at DESC;

-- ============================================
-- 4. CAVU vs APH vs FLYPARKS (Source Verification)
-- ============================================
-- Verify that files are being correctly identified and mapped
SELECT 
  f.filename,
  e.from_address,
  e.subject,
  f.parse_status,
  s.source AS staging_source,
  b.source AS booking_source,
  b.external_source,
  COUNT(DISTINCT b.id) AS bookings_from_file
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
LEFT JOIN booking_import_staging s ON s.source_email_id = e.id
LEFT JOIN bookings b ON b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
WHERE f.created_at > NOW() - INTERVAL '24 hours'
GROUP BY f.filename, e.from_address, e.subject, f.parse_status, s.source, b.source, b.external_source
ORDER BY f.created_at DESC;

-- ============================================
-- 5. QUICK CHECK: Latest booking sources
-- ============================================
-- Simple view of the last 20 bookings and their sources
SELECT 
  b.id,
  b.reference,
  b.customer_name,
  b.plate,
  b.source,
  b.external_source,
  b.created_at,
  e.from_address,
  f.filename
FROM bookings b
LEFT JOIN booking_import_staging s ON s.tenant_id = b.tenant_id
  AND s.reference = b.reference
  AND s.vehicle_reg = b.plate
LEFT JOIN ingest_emails e ON e.id = s.source_email_id
LEFT JOIN ingest_email_files f ON f.email_id = e.id
WHERE b.created_at > NOW() - INTERVAL '24 hours'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
ORDER BY b.created_at DESC
LIMIT 20;
