-- Inbound booking addresses are matched exactly against tenant_inbound_inboxes, and the ingest
-- route now lowercases the To: address (senders type BOOKINGS@… in capitals). Lowercase the
-- stored values so both sides agree. Safe to re-run.
UPDATE public.tenant_inbound_inboxes
SET to_address = lower(btrim(to_address))
WHERE to_address IS NOT NULL
  AND to_address <> lower(btrim(to_address));

UPDATE public.ingest_emails
SET to_address = lower(btrim(to_address))
WHERE to_address IS NOT NULL
  AND to_address <> lower(btrim(to_address));
