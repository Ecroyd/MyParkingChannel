-- Quick check: What files have arrived and their parse status
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. RECENT FILES WITH STATUS (Simplest)
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
  e.created_at AS email_received
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.created_at > NOW() - INTERVAL '24 hours'
ORDER BY f.created_at DESC
LIMIT 50;

-- ============================================
-- 2. SUMMARY BY STATUS (Quick Overview)
-- ============================================
SELECT 
  f.parse_status,
  COUNT(*) AS file_count,
  STRING_AGG(DISTINCT f.filename, ', ' ORDER BY f.filename) AS filenames
FROM ingest_email_files f
WHERE f.created_at > NOW() - INTERVAL '24 hours'
GROUP BY f.parse_status
ORDER BY 
  CASE f.parse_status
    WHEN 'pending' THEN 1
    WHEN 'parsed' THEN 2
    WHEN 'failed' THEN 3
    ELSE 4
  END;

-- ============================================
-- 3. FILES WITH BOOKING COUNTS (Detailed - FIXED)
-- ============================================
-- Links bookings to specific file via source_filename
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parsed_at,
  e.from_address,
  e.subject,
  COUNT(DISTINCT s.id) AS staging_rows,
  COUNT(DISTINCT b.id) AS bookings_created
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
LEFT JOIN booking_import_staging s ON s.source_email_id = e.id
  AND s.source_filename = f.filename  -- Match by filename to link to specific file
LEFT JOIN bookings b ON b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
  AND ABS(EXTRACT(EPOCH FROM (b.start_at - s.start_at))) < 60
WHERE f.created_at > NOW() - INTERVAL '24 hours'
GROUP BY f.id, f.filename, f.parse_status, f.parsed_at, e.from_address, e.subject
ORDER BY f.created_at DESC;

-- ============================================
-- 4. FAILED FILES (Need Attention)
-- ============================================
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_error,
  f.created_at,
  e.from_address,
  e.subject
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.parse_status = 'failed'
  AND f.created_at > NOW() - INTERVAL '7 days'
ORDER BY f.created_at DESC;

-- ============================================
-- 5. PENDING FILES (Waiting to Parse)
-- ============================================
SELECT 
  f.id AS file_id,
  f.filename,
  f.created_at,
  e.from_address,
  e.subject,
  EXTRACT(EPOCH FROM (NOW() - f.created_at)) / 60 AS minutes_waiting
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.parse_status = 'pending'
ORDER BY f.created_at DESC;
