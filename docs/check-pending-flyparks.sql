-- Check the most recent Flyparks email file and its status
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. MOST RECENT EMAIL-BODY.TXT FILE
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
WHERE f.filename = 'email-body.txt'
ORDER BY f.created_at DESC
LIMIT 1;

-- ============================================
-- 2. CHECK IF STAGING ROWS EXIST FOR THIS FILE
-- ============================================
-- Replace 'YOUR_EMAIL_ID' with the email_id from query #1
SELECT 
  s.id,
  s.reference,
  s.customer_name,
  s.vehicle_reg,
  s.start_at,
  s.end_at,
  s.total_price,
  s.source,
  s.external_reference,
  s.raw_json->>'channel' AS channel,
  s.created_at
FROM booking_import_staging s
WHERE s.source_email_id = (
  SELECT email_id FROM ingest_email_files 
  WHERE filename = 'email-body.txt'
  ORDER BY created_at DESC
  LIMIT 1
);

-- ============================================
-- 3. CHECK ALL STAGING ROWS FROM LAST HOUR
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
  s.created_at,
  e.from_address,
  e.subject
FROM booking_import_staging s
LEFT JOIN ingest_emails e ON e.id = s.source_email_id
WHERE s.created_at > NOW() - INTERVAL '1 hour'
ORDER BY s.created_at DESC;

-- ============================================
-- 4. CHECK ALL BOOKINGS FROM LAST HOUR
-- ============================================
SELECT 
  b.id,
  b.reference,
  b.customer_name,
  b.plate,
  b.start_at,
  b.end_at,
  b.money_charged,
  b.source,
  b.external_source,
  b.created_at
FROM bookings b
WHERE b.created_at > NOW() - INTERVAL '1 hour'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
ORDER BY b.created_at DESC;
