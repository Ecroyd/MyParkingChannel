-- Add processed_at / processed_status / processed_error for "Processing degraded" (parser/DB) vs ingest (Cloudflare).

ALTER TABLE public.ingest_canary_runs
  ADD COLUMN IF NOT EXISTS processed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS processed_status text NULL,
  ADD COLUMN IF NOT EXISTS processed_error text NULL;

CREATE INDEX IF NOT EXISTS idx_ingest_canary_runs_processed_at
  ON public.ingest_canary_runs (processed_at)
  WHERE processed_at IS NOT NULL;

COMMENT ON COLUMN public.ingest_canary_runs.processed_at IS 'When canary email was processed (stored/received); used for processing_down.';
COMMENT ON COLUMN public.ingest_canary_runs.processed_status IS 'ok | failed';
COMMENT ON COLUMN public.ingest_canary_runs.processed_error IS 'Error message when processed_status = failed.';
