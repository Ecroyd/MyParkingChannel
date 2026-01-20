-- Working Status Query (no view needed)
-- Run this in Supabase SQL Editor

SELECT 
  e.id AS email_id,
  e.created_at AS received_at,
  e.from_address,
  e.subject,
  e.message_id,
  e.status,
  -- Attachment info
  COALESCE(f_count.count, 0) AS attachment_count,
  COALESCE(f_parsed.count, 0) AS parsed_count,
  -- Import run info
  ir.inserted_count AS bookings_imported,
  ir.error_count AS import_errors,
  -- Pipeline status
  CASE 
    WHEN COALESCE(f_count.count, 0) = 0 THEN 'no_attachment'
    WHEN COALESCE(f_parsed.count, 0) = 0 AND EXISTS (
      SELECT 1 FROM ingest_email_files f2 
      WHERE f2.email_id = e.id AND f2.parse_status = 'pending'
    ) THEN 'file_pending'
    WHEN EXISTS (
      SELECT 1 FROM ingest_email_files f2 
      WHERE f2.email_id = e.id AND f2.parse_status = 'failed'
    ) THEN 'file_parse_failed'
    WHEN COALESCE(f_parsed.count, 0) > 0 AND ir.id IS NULL THEN 'file_parsed_not_imported'
    WHEN ir.inserted_count > 0 THEN 'bookings_imported'
    WHEN ir.error_count > 0 THEN 'import_errors'
    ELSE 'unknown'
  END AS pipeline_status
FROM ingest_emails e
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS count
  FROM ingest_email_files f
  WHERE f.email_id = e.id
) f_count ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS count
  FROM ingest_email_files f
  WHERE f.email_id = e.id AND f.parse_status = 'parsed'
) f_parsed ON true
LEFT JOIN import_runs ir ON ir.meta::jsonb->>'email_id' = e.id::text
  OR ir.created_at BETWEEN e.created_at AND e.created_at + INTERVAL '1 hour'
ORDER BY e.created_at DESC
LIMIT 20;
