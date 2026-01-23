-- Show recent bookings with all details
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. LAST 20 BOOKINGS WITH ALL DETAILS
-- ============================================
SELECT 
  b.id,
  b.reference,
  b.customer_name,
  b.customer_email,
  b.customer_phone,
  b.plate AS vehicle_registration,
  b.car_make AS vehicle_make,
  b.car_model AS vehicle_model,
  b.car_color AS vehicle_colour,
  b.start_at,
  b.end_at,
  b.status,
  b.money_charged,
  b.money_received,
  b.source,
  b.external_source,
  b.notes,
  b.created_at,
  b.updated_at,
  -- Source file/email info
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
  AND f.filename = s.source_filename
WHERE b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
ORDER BY b.created_at DESC
LIMIT 20;

-- ============================================
-- 2. LAST 50 BOOKINGS (Simpler, no joins)
-- ============================================
SELECT 
  id,
  reference,
  customer_name,
  customer_email,
  customer_phone,
  plate,
  car_make,
  car_model,
  car_color,
  start_at,
  end_at,
  status,
  money_charged,
  money_received,
  source,
  external_source,
  notes,
  created_at,
  updated_at
FROM bookings
WHERE tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
ORDER BY created_at DESC
LIMIT 50;

-- ============================================
-- 3. BOOKINGS FROM LAST 24 HOURS
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
  b.created_at,
  f.filename AS source_file,
  e.from_address AS source_email
FROM bookings b
LEFT JOIN booking_import_staging s ON s.tenant_id = b.tenant_id
  AND s.reference = b.reference
  AND s.vehicle_reg = b.plate
LEFT JOIN ingest_emails e ON e.id = s.source_email_id
LEFT JOIN ingest_email_files f ON f.email_id = e.id
  AND f.filename = s.source_filename
WHERE b.created_at > NOW() - INTERVAL '24 hours'
  AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
ORDER BY b.created_at DESC;
