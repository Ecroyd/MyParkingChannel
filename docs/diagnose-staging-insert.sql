-- Diagnostic queries to check why staging is empty

-- 1. Check if ANY rows exist in staging (regardless of source)
SELECT 
  COUNT(*) AS total_staging_rows,
  COUNT(DISTINCT source) AS distinct_sources,
  array_agg(DISTINCT source) AS all_sources
FROM booking_import_staging;

-- 2. Check recent staging rows (all sources, last 24 hours)
SELECT 
  id,
  source,
  tenant_id,
  reference,
  external_reference,
  created_at,
  source_email_id,
  source_filename
FROM booking_import_staging
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 20;

-- 3. Check if files are being parsed (should show 'parsed' status)
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parse_error,
  f.parsed_at,
  f.created_at,
  e.from_address,
  e.subject
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.created_at > NOW() - INTERVAL '24 hours'
ORDER BY f.created_at DESC;

-- 4. Check for staging insert errors in import_runs
SELECT 
  ir.id,
  ir.tenant_id,
  ir.profile_name,
  ir.inserted_count,
  ir.error_count,
  ir.created_at
FROM import_runs ir
WHERE ir.created_at > NOW() - INTERVAL '24 hours'
  AND ir.profile_name LIKE '%Email import%'
ORDER BY ir.created_at DESC;

-- 5. Check bookings created (to see if auto-promote is working)
-- Note: source enum values are: 'direct', 'parkvia', 'holidayextras', 'manual', 'other', 'cavu', 'supplier_api'
-- APH email imports use source='other' with external_source='APH Email Import'
SELECT 
  b.id,
  b.reference,
  b.source,
  b.external_source,
  b.customer_name,
  b.created_at,
  b.tenant_id
FROM bookings b
WHERE b.created_at > NOW() - INTERVAL '24 hours'
  AND (b.source = 'other' AND (b.external_source LIKE '%APH%' OR b.external_source LIKE '%Email%'))
ORDER BY b.created_at DESC
LIMIT 20;

-- 6. Check if staging table has required columns
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'booking_import_staging'
  AND column_name IN (
    'source',
    'source_email_id',
    'source_filename',
    'external_reference',
    'customer_firstname',
    'customer_lastname'
  )
ORDER BY column_name;
