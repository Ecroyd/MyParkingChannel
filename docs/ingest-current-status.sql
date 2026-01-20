-- Current Status Query (works without the view)
-- This shows what's actually happening right now

-- ============================================
-- CURRENT STATE: Emails received, no attachments yet
-- ============================================
SELECT 
  e.id AS email_id,
  e.created_at AS received_at,
  e.from_address,
  e.subject,
  e.message_id,
  e.status,
  -- Check if we have any files for this email
  (SELECT COUNT(*) FROM ingest_email_files f WHERE f.email_id = e.id) AS attachment_count,
  -- Check if any files were parsed
  (SELECT COUNT(*) FROM ingest_email_files f 
   WHERE f.email_id = e.id AND f.parse_status = 'parsed') AS parsed_count
FROM ingest_emails e
ORDER BY e.created_at DESC
LIMIT 20;

-- ============================================
-- WHY NO ATTACHMENTS?
-- ============================================
-- The current Cloudflare Worker only sends a minimal RFC822 stub.
-- It does NOT extract or send attachments.
-- 
-- To get attachments, you need to:
-- 1. Update the Worker to extract attachments from the email
-- 2. Send attachment data to your API
-- 3. Store attachments in ingest_email_files table
--
-- OR use the full raw email approach (see next section)

-- ============================================
-- CHECK IF YOU'RE RECEIVING FULL EMAILS
-- ============================================
SELECT 
  id,
  created_at,
  from_address,
  subject,
  LENGTH(raw_rfc822_base64) AS email_size_bytes,
  -- If size is very small (< 500 bytes), it's just the stub, not full email
  CASE 
    WHEN LENGTH(raw_rfc822_base64) < 500 THEN 'stub_only'
    ELSE 'full_email'
  END AS email_type
FROM ingest_emails
ORDER BY created_at DESC
LIMIT 10;
