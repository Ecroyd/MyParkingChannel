-- Add last_export_at column to tenant_integration_channels for scheduling
-- This is optional - the job function will work without it

ALTER TABLE public.tenant_integration_channels
  ADD COLUMN IF NOT EXISTS last_export_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenant_integration_channels_last_export_at
  ON public.tenant_integration_channels(tenant_id, last_export_at)
  WHERE enabled = true;

