-- Debug why a Flyparks email file isn't parsing
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. CHECK THE SPECIFIC FILE STATUS
-- ============================================
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parse_error,
  f.parsed_at,
  f.created_at AS file_created,
  EXTRACT(EPOCH FROM (NOW() - f.created_at)) / 60 AS minutes_since_created,
  e.id AS email_id,
  e.from_address,
  e.subject,
  e.created_at AS email_received
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.filename = 'email-body.txt'
  AND f.created_at > NOW() - INTERVAL '2 hours'
ORDER BY f.created_at DESC
LIMIT 5;

-- ============================================
-- 2. CHECK IF TENANT MAPPING EXISTS
-- ============================================
-- The file won't auto-parse if there's no tenant mapping
SELECT 
  e.id AS email_id,
  e.from_address,
  e.subject,
  CASE 
    WHEN e.from_address = 'jcecroyd@gmail.com' THEN '✅ Mapped to bab45dab-19e8-4230-b18e-ee1f663608e5'
    WHEN e.from_address = 'info@flyparksexeter.co.uk' THEN '✅ Mapped to bab45dab-19e8-4230-b18e-ee1f663608e5'
    ELSE '❌ NO MAPPING - Auto-parse will not trigger'
  END AS tenant_mapping_status
FROM ingest_emails e
WHERE e.created_at > NOW() - INTERVAL '2 hours'
  AND e.id IN (
    SELECT email_id FROM ingest_email_files 
    WHERE filename = 'email-body.txt' 
    AND created_at > NOW() - INTERVAL '2 hours'
  );

-- ============================================
-- 3. CHECK STAGING FOR THIS EMAIL (if parsing happened)
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
  s.raw_json->>'channel' AS channel,
  s.created_at
FROM booking_import_staging s
WHERE s.source_email_id IN (
  SELECT email_id FROM ingest_email_files 
  WHERE filename = 'email-body.txt' 
  AND created_at > NOW() - INTERVAL '2 hours'
)
ORDER BY s.created_at DESC;

-- ============================================
-- 4. GET FILE ID FOR MANUAL PARSING
-- ============================================
-- Use this file_id to manually trigger parsing via API
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  e.from_address,
  'bab45dab-19e8-4230-b18e-ee1f663608e5' AS tenant_id
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.filename = 'email-body.txt'
  AND f.created_at > NOW() - INTERVAL '2 hours'
  AND f.parse_status = 'pending'
ORDER BY f.created_at DESC
LIMIT 1;
