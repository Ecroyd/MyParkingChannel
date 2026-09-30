-- Mark ingest emails as parsed when attachment parse already succeeded but the
-- parent row was left at status=received (auto-parse errors were swallowed).
UPDATE public.ingest_emails e
SET status = 'parsed',
    error = null
WHERE e.status = 'received'
  AND e.error IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.ingest_email_files f
    WHERE f.email_id = e.id
      AND f.parse_status = 'parsed'
      AND f.parse_outcome IN ('parsed', 'empty')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.ingest_email_files f
    WHERE f.email_id = e.id
      AND (
        f.parse_status = 'failed'
        OR f.parse_outcome = 'failed'
      )
  );

-- Normalize stored inbound addresses so tenant_inbound_inboxes exact match works.
UPDATE public.ingest_emails
SET to_address = lower(btrim(to_address))
WHERE to_address IS NOT NULL
  AND to_address <> lower(btrim(to_address));

UPDATE public.tenant_inbound_inboxes
SET to_address = lower(btrim(to_address))
WHERE to_address IS NOT NULL
  AND to_address <> lower(btrim(to_address));
