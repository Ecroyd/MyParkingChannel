-- Single-row view for ingest canary health: last_received_at, ingest_down (received_at missing or > 20 min), last_processed_at, processing_down, has_any_run.
-- Run after 20260203_ingest_canary_processed_at.sql (view references processed_at).
-- Use from /api/admin/ingest-canary/health so DOWN is time-based on received_at, not status.
-- DROP then CREATE so column order/names can change without "cannot change name of view column" error.

DROP VIEW IF EXISTS public.ingest_canary_health;

CREATE VIEW public.ingest_canary_health AS
SELECT
  (SELECT received_at FROM public.ingest_canary_runs WHERE received_at IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS last_received_at,
  (SELECT last_error FROM public.ingest_canary_runs WHERE received_at IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS last_error,
  (SELECT token FROM public.ingest_canary_runs WHERE received_at IS NOT NULL ORDER BY received_at DESC LIMIT 1) AS token,
  (
    (SELECT received_at FROM public.ingest_canary_runs WHERE received_at IS NOT NULL ORDER BY received_at DESC LIMIT 1) IS NULL
    OR (now() - (SELECT received_at FROM public.ingest_canary_runs WHERE received_at IS NOT NULL ORDER BY received_at DESC LIMIT 1)) > interval '20 minutes'
  ) AS ingest_down,
  (SELECT processed_at FROM public.ingest_canary_runs WHERE processed_at IS NOT NULL ORDER BY processed_at DESC LIMIT 1) AS last_processed_at,
  (
    (SELECT processed_at FROM public.ingest_canary_runs WHERE processed_at IS NOT NULL ORDER BY processed_at DESC LIMIT 1) IS NULL
    OR (now() - (SELECT processed_at FROM public.ingest_canary_runs WHERE processed_at IS NOT NULL ORDER BY processed_at DESC LIMIT 1)) > interval '20 minutes'
  ) AS processing_down,
  EXISTS (SELECT 1 FROM public.ingest_canary_runs LIMIT 1) AS has_any_run;

-- RLS: same as base table (platform admins can select)
ALTER VIEW public.ingest_canary_health SET (security_invoker = false);

COMMENT ON VIEW public.ingest_canary_health IS 'Health for ingest canary: last_received_at, ingest_down, last_processed_at, processing_down, has_any_run.';
