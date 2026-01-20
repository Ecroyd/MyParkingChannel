-- Migration: Create ingest_emails table for raw email storage
-- Purpose: Store raw RFC822 emails from Cloudflare Worker before parsing/deduplication

-- 1) Table to store raw inbound emails (v1: store first, parse later)
CREATE TABLE IF NOT EXISTS public.ingest_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  received_at TIMESTAMPTZ NOT NULL,
  to_address TEXT,
  from_address TEXT,
  subject TEXT,

  -- we store raw RFC822 email as base64 so nothing is lost
  raw_rfc822_base64 TEXT NOT NULL,

  -- a hash to dedupe (same email resent/forwarded)
  sha256 TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'received',  -- received | parsed | failed
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Dedupe guarantee: same email won't insert twice
CREATE UNIQUE INDEX IF NOT EXISTS ingest_emails_sha256_uidx
ON public.ingest_emails (sha256);

-- 3) Optional: helpful query index
CREATE INDEX IF NOT EXISTS ingest_emails_created_at_idx
ON public.ingest_emails (created_at DESC);

-- 4) RLS: keep it locked down (API will use service role, not anon)
ALTER TABLE public.ingest_emails ENABLE ROW LEVEL SECURITY;

-- No policies needed for service role (bypasses RLS).
-- If you later want admins to view in-app, we add policies then.
