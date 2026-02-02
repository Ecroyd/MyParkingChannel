-- Ingest canary: track runs for Cloudflare Email Routing + Worker + /api/ingest/email
-- Used to prove inbound booking email path is alive; no manual inbox checks.

CREATE TABLE IF NOT EXISTS public.ingest_canary_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'received', 'down')),
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingest_canary_runs_sent_at_desc
  ON public.ingest_canary_runs (sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingest_canary_runs_received_at
  ON public.ingest_canary_runs (received_at)
  WHERE received_at IS NOT NULL;

-- Updated_at trigger (reuse helper from email queue migration)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ingest_canary_runs_updated_at
  BEFORE UPDATE ON public.ingest_canary_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS: select for platform admins; inserts/updates only via service role (no user policy)
ALTER TABLE public.ingest_canary_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can select ingest_canary_runs"
  ON public.ingest_canary_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies for auth.uid() → only service role (server) can write
