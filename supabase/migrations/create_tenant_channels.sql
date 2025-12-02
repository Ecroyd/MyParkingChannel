-- Create tenant_channels table
CREATE TABLE IF NOT EXISTS public.tenant_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  kind TEXT NOT NULL DEFAULT 'generic',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_channels_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_channels_tenant_code_key UNIQUE (tenant_id, code)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tenant_channels_tenant_id ON public.tenant_channels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_channels_tenant_active ON public.tenant_channels(tenant_id, is_active);

-- Enable RLS
ALTER TABLE public.tenant_channels ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see/update channels for their tenants
CREATE POLICY "Users can view their tenant channels"
  ON public.tenant_channels
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert channels for their tenants"
  ON public.tenant_channels
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update channels for their tenants"
  ON public.tenant_channels
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete channels for their tenants"
  ON public.tenant_channels
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_tenants 
      WHERE user_id = auth.uid()
    )
  );

-- Add channel_id to partner_api_keys
ALTER TABLE public.partner_api_keys
  ADD COLUMN IF NOT EXISTS channel_id UUID NULL
  REFERENCES public.tenant_channels(id) ON DELETE SET NULL;

-- Create index for channel_id lookups
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_channel_id ON public.partner_api_keys(channel_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tenant_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_tenant_channels_updated_at
  BEFORE UPDATE ON public.tenant_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_channels_updated_at();

