-- 002_backfill_attribution.sql
-- Backfill bookings and import_files with correct attribution based on detected channel
-- Run this after applying 001_import_attribution.sql

-- ============================================
-- 1. BACKFILL ingest_email_files attribution
-- ============================================
-- Update files based on detected channel from staging raw_json
UPDATE public.ingest_email_files f
SET
  parser_key = CASE 
    WHEN EXISTS (
      SELECT 1 FROM booking_import_staging s
      JOIN ingest_emails e ON e.id = s.source_email_id
      WHERE s.source_filename = f.filename
        AND s.source_email_id = f.email_id
        AND s.raw_json->>'channel' = 'APH'
      LIMIT 1
    ) THEN 'aph_email_import'
    WHEN EXISTS (
      SELECT 1 FROM booking_import_staging s
      JOIN ingest_emails e ON e.id = s.source_email_id
      WHERE s.source_filename = f.filename
        AND s.source_email_id = f.email_id
        AND s.raw_json->>'channel' = 'CAVU'
      LIMIT 1
    ) THEN 'cavu_email_import'
    WHEN EXISTS (
      SELECT 1 FROM booking_import_staging s
      JOIN ingest_emails e ON e.id = s.source_email_id
      WHERE s.source_filename = f.filename
        AND s.source_email_id = f.email_id
        AND s.raw_json->>'channel' = 'HOLIDAY_EXTRAS'
      LIMIT 1
    ) THEN 'holiday_extras_email_import'
    WHEN EXISTS (
      SELECT 1 FROM booking_import_staging s
      JOIN ingest_emails e ON e.id = s.source_email_id
      WHERE s.source_filename = f.filename
        AND s.source_email_id = f.email_id
        AND s.raw_json->>'channel' = 'FLYPARKS_EMAIL'
      LIMIT 1
    ) THEN 'flyparks_email_import'
    ELSE 'unknown'
  END,
  detected_source = (
    SELECT s.raw_json->>'channel'
    FROM booking_import_staging s
    JOIN ingest_emails e ON e.id = s.source_email_id
    WHERE s.source_filename = f.filename
      AND s.source_email_id = f.email_id
    LIMIT 1
  ),
  external_source = CASE 
    WHEN EXISTS (
      SELECT 1 FROM booking_import_staging s
      JOIN ingest_emails e ON e.id = s.source_email_id
      WHERE s.source_filename = f.filename
        AND s.source_email_id = f.email_id
        AND s.raw_json->>'channel' = 'APH'
      LIMIT 1
    ) THEN 'APH Email Import'
    WHEN EXISTS (
      SELECT 1 FROM booking_import_staging s
      JOIN ingest_emails e ON e.id = s.source_email_id
      WHERE s.source_filename = f.filename
        AND s.source_email_id = f.email_id
        AND s.raw_json->>'channel' = 'CAVU'
      LIMIT 1
    ) THEN 'CAVU Email Import'
    WHEN EXISTS (
      SELECT 1 FROM booking_import_staging s
      JOIN ingest_emails e ON e.id = s.source_email_id
      WHERE s.source_filename = f.filename
        AND s.source_email_id = f.email_id
        AND s.raw_json->>'channel' = 'HOLIDAY_EXTRAS'
      LIMIT 1
    ) THEN 'Holiday Extras Email Import'
    WHEN EXISTS (
      SELECT 1 FROM booking_import_staging s
      JOIN ingest_emails e ON e.id = s.source_email_id
      WHERE s.source_filename = f.filename
        AND s.source_email_id = f.email_id
        AND s.raw_json->>'channel' = 'FLYPARKS_EMAIL'
      LIMIT 1
    ) THEN 'Flyparks Email Import'
    ELSE COALESCE(f.external_source, 'Unknown Import')
  END,
  attribution_confidence = CASE 
    WHEN EXISTS (
      SELECT 1 FROM booking_import_staging s
      JOIN ingest_emails e ON e.id = s.source_email_id
      WHERE s.source_filename = f.filename
        AND s.source_email_id = f.email_id
        AND s.raw_json->>'channel' IS NOT NULL
      LIMIT 1
    ) THEN 'parser'
    ELSE 'fallback'
  END
WHERE f.parse_status = 'parsed'
  AND f.parser_key IS NULL; -- Only update files that haven't been backfilled yet

-- ============================================
-- 2. BACKFILL bookings source/external_source
-- ============================================
-- Update bookings based on the import file that created them
-- This uses the staging table to link bookings to their source files
UPDATE public.bookings b
SET
  source = CASE 
    WHEN f.parser_key = 'aph_email_import' THEN 'aph'
    WHEN f.parser_key = 'cavu_email_import' THEN 'cavu'
    WHEN f.parser_key = 'holiday_extras_email_import' THEN 'holidayextras'
    WHEN f.parser_key = 'flyparks_email_import' THEN 'other'
    ELSE COALESCE(b.source, 'other')
  END,
  external_source = COALESCE(f.external_source, b.external_source, 'Unknown Import')
FROM booking_import_staging s
JOIN ingest_email_files f ON f.email_id = s.source_email_id
  AND f.filename = s.source_filename
WHERE b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
  AND f.parser_key IS NOT NULL
  AND (
    b.source != CASE 
      WHEN f.parser_key = 'aph_email_import' THEN 'aph'
      WHEN f.parser_key = 'cavu_email_import' THEN 'cavu'
      WHEN f.parser_key = 'holiday_extras_email_import' THEN 'holidayextras'
      WHEN f.parser_key = 'flyparks_email_import' THEN 'other'
      ELSE b.source
    END
    OR b.external_source != COALESCE(f.external_source, b.external_source)
  );

-- ============================================
-- 3. VERIFICATION QUERY
-- ============================================
-- Check that attribution is consistent after backfill
SELECT 
  f.parser_key,
  f.detected_source,
  f.external_source AS file_external_source,
  f.attribution_confidence,
  COUNT(DISTINCT f.id) AS file_count,
  COUNT(DISTINCT b.id) AS booking_count,
  -- Check for mismatches
  COUNT(DISTINCT CASE 
    WHEN b.source != CASE 
      WHEN f.parser_key = 'aph_email_import' THEN 'aph'
      WHEN f.parser_key = 'cavu_email_import' THEN 'cavu'
      WHEN f.parser_key = 'holiday_extras_email_import' THEN 'holidayextras'
      WHEN f.parser_key = 'flyparks_email_import' THEN 'other'
      ELSE b.source
    END THEN b.id
  END) AS source_mismatches,
  COUNT(DISTINCT CASE 
    WHEN b.external_source != f.external_source THEN b.id
  END) AS external_source_mismatches
FROM ingest_email_files f
LEFT JOIN booking_import_staging s ON s.source_email_id = f.email_id
  AND s.source_filename = f.filename
LEFT JOIN bookings b ON b.tenant_id = s.tenant_id
  AND b.reference = s.reference
  AND b.plate = s.vehicle_reg
WHERE f.parse_status = 'parsed'
  AND f.parser_key IS NOT NULL
GROUP BY f.parser_key, f.detected_source, f.external_source, f.attribution_confidence
ORDER BY booking_count DESC;
