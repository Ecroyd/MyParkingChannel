-- Check why auto-parse didn't trigger for a specific email
-- Replace the email_id with your actual email ID

-- 1. Check email and files
SELECT 
  e.id AS email_id,
  e.from_address,
  e.subject,
  e.created_at,
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parse_error,
  f.created_at AS file_created
FROM ingest_emails e
LEFT JOIN ingest_email_files f ON f.email_id = e.id
WHERE e.id = 'e21e59aa-b098-4265-8a9e-ef2ebd5e9495'  -- Replace with your email ID
ORDER BY f.created_at DESC;

-- 2. Check if tenant mapping exists for this email
-- Expected: jcecroyd@gmail.com should map to bab45dab-19e8-4230-b18e-ee1f663608e5
SELECT 
  e.from_address,
  CASE 
    WHEN e.from_address = 'jcecroyd@gmail.com' THEN 'bab45dab-19e8-4230-b18e-ee1f663608e5'
    WHEN e.from_address = 'info@flyparksexeter.co.uk' THEN 'bab45dab-19e8-4230-b18e-ee1f663608e5'
    ELSE 'NO MAPPING'
  END AS expected_tenant_id
FROM ingest_emails e
WHERE e.id = 'e21e59aa-b098-4265-8a9e-ef2ebd5e9495';

-- 3. Check staging for this email
SELECT 
  s.id,
  s.reference,
  s.customer_name,
  s.created_at,
  s.source_email_id
FROM booking_import_staging s
WHERE s.source_email_id = 'e21e59aa-b098-4265-8a9e-ef2ebd5e9495';

-- 4. Check bookings created from this email
SELECT 
  b.id,
  b.reference,
  b.customer_name,
  b.created_at,
  b.external_source
FROM bookings b
WHERE b.created_at > (
  SELECT created_at FROM ingest_emails WHERE id = 'e21e59aa-b098-4265-8a9e-ef2ebd5e9495'
)
AND b.created_at < (
  SELECT created_at + INTERVAL '5 minutes' FROM ingest_emails WHERE id = 'e21e59aa-b098-4265-8a9e-ef2ebd5e9495'
)
AND b.tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
ORDER BY b.created_at DESC;
