-- Migration: Add message_id and provider fields to ingest_emails
-- Purpose: Better deduplication using email Message-ID header + provider tracking

-- Add new columns
ALTER TABLE public.ingest_emails
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

-- Dedupe on message-id when it exists (best signal for email systems)
CREATE UNIQUE INDEX IF NOT EXISTS ingest_emails_message_id_uidx
ON public.ingest_emails (message_id)
WHERE message_id IS NOT NULL AND message_id <> '';

-- Keep the sha256 unique index as a second line of defense
-- (already created in 012_ingest_emails.sql as ingest_emails_sha256_uidx)

-- Index for provider lookups
CREATE INDEX IF NOT EXISTS ingest_emails_provider_idx
ON public.ingest_emails (provider)
WHERE provider IS NOT NULL;
