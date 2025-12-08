-- Create tenant_integration_channels table for external integrations (APH SFTP, etc.)
-- This is separate from tenant_channels which is for pricing channels
CREATE TABLE IF NOT EXISTS public.tenant_integration_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'aph_sftp', 'holiday_extras', etc.
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, provider)
);

-- Create aph_rate_exports table to log export history
CREATE TABLE IF NOT EXISTS public.aph_rate_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.tenant_integration_channels(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  rows_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tenant_integration_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aph_rate_exports ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant_integration_channels
CREATE POLICY "Users can view their tenant's integration channels"
  ON public.tenant_integration_channels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_tenants.tenant_id = tenant_integration_channels.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their tenant's integration channels"
  ON public.tenant_integration_channels
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_tenants.tenant_id = tenant_integration_channels.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their tenant's integration channels"
  ON public.tenant_integration_channels
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_tenants.tenant_id = tenant_integration_channels.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their tenant's integration channels"
  ON public.tenant_integration_channels
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_tenants.tenant_id = tenant_integration_channels.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
  );

-- RLS Policies for aph_rate_exports
CREATE POLICY "Users can view their tenant's APH rate exports"
  ON public.aph_rate_exports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_tenants.tenant_id = aph_rate_exports.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tenant_integration_channels_tenant_provider 
  ON public.tenant_integration_channels(tenant_id, provider);
CREATE INDEX IF NOT EXISTS idx_tenant_integration_channels_enabled 
  ON public.tenant_integration_channels(tenant_id, enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_aph_rate_exports_tenant_id 
  ON public.aph_rate_exports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_aph_rate_exports_channel_id 
  ON public.aph_rate_exports(channel_id);
CREATE INDEX IF NOT EXISTS idx_aph_rate_exports_ran_at 
  ON public.aph_rate_exports(tenant_id, ran_at DESC);

