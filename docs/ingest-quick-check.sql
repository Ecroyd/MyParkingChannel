-- Quick SQL queries to check email ingest status
-- Run these in Supabase SQL Editor

-- ============================================
-- 1. RECENT EMAILS RECEIVED
-- ============================================
SELECT 
  id,
  created_at AS received_at,
  from_address,
  to_address,
  subject,
  message_id,
  status,
  LENGTH(raw_rfc822_base64) AS email_size_bytes
FROM ingest_emails
ORDER BY created_at DESC
LIMIT 20;

-- ============================================
-- 2. EMAILS WITH ATTACHMENTS
-- ============================================
SELECT 
  e.id AS email_id,
  e.created_at AS email_received,
  e.from_address,
  e.subject,
  f.id AS file_id,
  f.filename,
  f.content_type,
  f.file_size,
  f.parse_status,
  f.parse_error,
  f.parsed_at
FROM ingest_emails e
JOIN ingest_email_files f ON f.email_id = e.id
ORDER BY e.created_at DESC
LIMIT 20;

-- ============================================
-- 3. FILES WAITING TO BE PARSED
-- ============================================
SELECT 
  f.id,
  f.filename,
  f.content_type,
  f.file_size,
  f.created_at,
  e.from_address,
  e.subject,
  e.created_at AS email_received_at
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.parse_status = 'pending'
ORDER BY f.created_at DESC;

-- ============================================
-- 4. FILES THAT FAILED TO PARSE
-- ============================================
SELECT 
  f.id,
  f.filename,
  f.parse_error,
  f.created_at,
  e.from_address,
  e.subject
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.parse_status = 'failed'
ORDER BY f.created_at DESC
LIMIT 20;

-- ============================================
-- 5. RECENT IMPORT RUNS (from email files)
-- ============================================
SELECT 
  ir.id,
  ir.profile_name,
  ir.inserted_count,
  ir.skipped_duplicates,
  ir.error_count,
  ir.created_at,
  ir.meta
FROM import_runs ir
WHERE ir.created_at > NOW() - INTERVAL '7 days'
ORDER BY ir.created_at DESC
LIMIT 20;

-- ============================================
-- 6. FULL PIPELINE STATUS (Summary)
-- ============================================
SELECT 
  COUNT(DISTINCT e.id) AS total_emails,
  COUNT(DISTINCT f.id) AS total_files,
  COUNT(DISTINCT CASE WHEN f.parse_status = 'pending' THEN f.id END) AS files_pending,
  COUNT(DISTINCT CASE WHEN f.parse_status = 'parsed' THEN f.id END) AS files_parsed,
  COUNT(DISTINCT CASE WHEN f.parse_status = 'failed' THEN f.id END) AS files_failed,
  COUNT(DISTINCT ir.id) AS import_runs_count,
  SUM(ir.inserted_count) AS total_bookings_imported
FROM ingest_emails e
LEFT JOIN ingest_email_files f ON f.email_id = e.id
LEFT JOIN import_runs ir ON ir.created_at > e.created_at - INTERVAL '1 hour'
WHERE e.created_at > NOW() - INTERVAL '7 days';

-- ============================================
-- 7. CHECK FOR DUPLICATE EMAILS
-- ============================================
SELECT 
  message_id,
  COUNT(*) AS count,
  ARRAY_AGG(id ORDER BY created_at) AS email_ids,
  ARRAY_AGG(created_at ORDER BY created_at) AS received_times
FROM ingest_emails
WHERE message_id IS NOT NULL
GROUP BY message_id
HAVING COUNT(*) > 1
ORDER BY count DESC;
