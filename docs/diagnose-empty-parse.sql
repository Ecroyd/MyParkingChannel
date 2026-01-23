-- Diagnose why parsed files have 0 rows
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. CHECK FILE SIZES (are files empty?)
-- ============================================
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.file_size,
  f.parse_error,
  f.parsed_at,
  e.from_address,
  e.subject
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
WHERE f.created_at > NOW() - INTERVAL '2 hours'
  AND f.parse_status = 'parsed'
ORDER BY f.created_at DESC;

-- ============================================
-- 2. CHECK IMPORT RUNS FOR THESE FILES
-- ============================================
-- Import runs should show how many rows were processed
SELECT 
  ir.id AS import_run_id,
  ir.profile_name,
  ir.inserted_count,
  ir.skipped_duplicates,
  ir.error_count,
  ir.created_at,
  f.filename
FROM import_runs ir
LEFT JOIN ingest_email_files f ON f.created_at BETWEEN ir.created_at - INTERVAL '1 minute' AND ir.created_at + INTERVAL '1 minute'
WHERE ir.created_at > NOW() - INTERVAL '2 hours'
  AND ir.profile_name LIKE '%Email import%'
ORDER BY ir.created_at DESC;

-- ============================================
-- 3. CHECK IF FILES WERE ALREADY PARSED BEFORE
-- ============================================
-- If files were marked as "parsed" from a previous attempt, they won't re-parse
SELECT 
  f.id AS file_id,
  f.filename,
  f.parse_status,
  f.parsed_at,
  f.parse_error,
  COUNT(DISTINCT s.id) AS staging_rows_exist,
  COUNT(DISTINCT b.id) AS bookings_exist
FROM ingest_email_files f
JOIN ingest_emails e ON e.id = f.email_id
LEFT JOIN booking_import_staging s ON s.source_email_id = e.id
  AND s.source_filename = f.filename
LEFT JOIN bookings b ON b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
WHERE f.id IN (
  '61710715-0082-4652-a79e-9825cbddf4be',  -- APH.csv .txt
  '6df2256d-60d8-46af-a30f-44da62d52a84',  -- ext1180126.txt
  'ae26512b-8418-4559-918f-0d0c2c764c87'   -- 27_HOURLY_20260118_200042.csv
)
GROUP BY f.id, f.filename, f.parse_status, f.parsed_at, f.parse_error;

-- ============================================
-- 4. RESET FILE STATUS TO RE-PARSE
-- ============================================
-- If you want to force re-parsing, run this (then use PowerShell to parse again):
-- UPDATE ingest_email_files 
-- SET parse_status = 'pending', 
--     parsed_at = NULL, 
--     parse_error = NULL
-- WHERE id IN (
--   '61710715-0082-4652-a79e-9825cbddf4be',
--   '6df2256d-60d8-46af-a30f-44da62d52a84',
--   'ae26512b-8418-4559-918f-0d0c2c764c87'
-- );
