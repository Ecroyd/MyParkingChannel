-- Migration: Create view to track email ingest → file → booking import status
-- Purpose: Easy monitoring of the full pipeline from email to bookings

CREATE OR REPLACE VIEW public.ingest_status AS
SELECT 
  e.id AS email_id,
  e.created_at AS email_received_at,
  e.from_address,
  e.to_address,
  e.subject,
  e.message_id,
  e.status AS email_status,
  e.sha256,
  
  -- File info (if attachment exists)
  f.id AS file_id,
  f.filename,
  f.content_type,
  f.file_size,
  f.parse_status,
  f.parse_error,
  f.parsed_at,
  f.created_at AS file_created_at,
  
  -- Import run info (if file was processed)
  ir.id AS import_run_id,
  ir.profile_name,
  ir.inserted_count,
  ir.skipped_duplicates,
  ir.error_count,
  ir.created_at AS import_run_created_at,
  
  -- Booking count (if bookings were created)
  (SELECT COUNT(*) 
   FROM bookings b 
   WHERE b.source = 'email_import' 
   AND b.notes LIKE '%email_id:' || e.id::text || '%'
  ) AS bookings_created_count,
  
  -- Overall status
  CASE 
    WHEN f.id IS NULL THEN 'no_attachment'
    WHEN f.parse_status = 'pending' THEN 'file_pending'
    WHEN f.parse_status = 'failed' THEN 'file_parse_failed'
    WHEN f.parse_status = 'parsed' AND ir.id IS NULL THEN 'file_parsed_not_imported'
    WHEN ir.id IS NOT NULL AND ir.inserted_count > 0 THEN 'bookings_imported'
    WHEN ir.id IS NOT NULL AND ir.error_count > 0 THEN 'import_errors'
    ELSE 'unknown'
  END AS pipeline_status

FROM public.ingest_emails e
LEFT JOIN public.ingest_email_files f ON f.email_id = e.id
LEFT JOIN public.import_runs ir ON ir.id::text = (
  SELECT value 
  FROM jsonb_each_text(ir.meta::jsonb) 
  WHERE key = 'email_file_id' AND value = f.id::text
  LIMIT 1
)
ORDER BY e.created_at DESC;

-- Grant access (adjust as needed for your RLS setup)
-- This view will be accessible via service role
