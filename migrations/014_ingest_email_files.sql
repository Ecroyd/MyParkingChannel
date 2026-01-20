-- Migration: Create ingest_email_files table for attachment storage
-- Purpose: Store CSV/txt attachments from emails for later parsing

CREATE TABLE IF NOT EXISTS public.ingest_email_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES public.ingest_emails(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT,
  storage_bucket TEXT NOT NULL DEFAULT 'email-imports',
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  parsed_at TIMESTAMPTZ,
  parse_status TEXT DEFAULT 'pending', -- pending | parsed | failed
  parse_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS ingest_email_files_email_id_idx
ON public.ingest_email_files (email_id);

-- Index for pending parsing jobs
CREATE INDEX IF NOT EXISTS ingest_email_files_parse_status_idx
ON public.ingest_email_files (parse_status, created_at)
WHERE parse_status = 'pending';

-- Enable RLS
ALTER TABLE public.ingest_email_files ENABLE ROW LEVEL SECURITY;

-- No policies needed for service role (bypasses RLS).
-- If you later want admins to view in-app, we add policies then.
