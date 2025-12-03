-- Create tenant_dynamic_pricing_settings table
CREATE TABLE IF NOT EXISTS public.tenant_dynamic_pricing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id)
);

-- Create tenant_dynamic_pricing_rules table
CREATE TABLE IF NOT EXISTS public.tenant_dynamic_pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  settings_id UUID NOT NULL REFERENCES public.tenant_dynamic_pricing_settings(id) ON DELETE CASCADE,
  threshold_percent DECIMAL(5,2) NOT NULL CHECK (threshold_percent >= 0 AND threshold_percent <= 100),
  price_increase_percent DECIMAL(5,2) NOT NULL CHECK (price_increase_percent >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add dynamic pricing fields to bookings table
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS dynamic_pricing_applied BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dynamic_pricing_multiplier DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS dynamic_pricing_rule_id UUID REFERENCES public.tenant_dynamic_pricing_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dynamic_pricing_occupancy_percent DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS dynamic_pricing_note TEXT;

-- Enable RLS
ALTER TABLE public.tenant_dynamic_pricing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_dynamic_pricing_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant_dynamic_pricing_settings
CREATE POLICY "Users can view their tenant's dynamic pricing settings"
  ON public.tenant_dynamic_pricing_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_tenants.tenant_id = tenant_dynamic_pricing_settings.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their tenant's dynamic pricing settings"
  ON public.tenant_dynamic_pricing_settings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_tenants.tenant_id = tenant_dynamic_pricing_settings.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their tenant's dynamic pricing settings"
  ON public.tenant_dynamic_pricing_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_tenants.tenant_id = tenant_dynamic_pricing_settings.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
  );

-- RLS Policies for tenant_dynamic_pricing_rules
CREATE POLICY "Users can view their tenant's dynamic pricing rules"
  ON public.tenant_dynamic_pricing_rules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_tenants.tenant_id = tenant_dynamic_pricing_rules.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their tenant's dynamic pricing rules"
  ON public.tenant_dynamic_pricing_rules
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_tenants.tenant_id = tenant_dynamic_pricing_rules.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their tenant's dynamic pricing rules"
  ON public.tenant_dynamic_pricing_rules
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_tenants.tenant_id = tenant_dynamic_pricing_rules.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their tenant's dynamic pricing rules"
  ON public.tenant_dynamic_pricing_rules
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_tenants.tenant_id = tenant_dynamic_pricing_rules.tenant_id
      AND user_tenants.user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tenant_dynamic_pricing_settings_tenant_id 
  ON public.tenant_dynamic_pricing_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_dynamic_pricing_rules_tenant_id 
  ON public.tenant_dynamic_pricing_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_dynamic_pricing_rules_active 
  ON public.tenant_dynamic_pricing_rules(tenant_id, is_active, threshold_percent);

