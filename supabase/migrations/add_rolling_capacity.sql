-- Add rolling capacity support to tenant_settings
-- This allows tenants to accept bookings up to N months in advance with a default daily capacity

-- Ensure tenant_settings table exists (it should already exist for anpr_provider)
CREATE TABLE IF NOT EXISTS public.tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  anpr_provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id)
);

-- Add rolling capacity columns
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS rolling_capacity_months INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS default_daily_capacity INTEGER NOT NULL DEFAULT 250;

-- Add check constraints
ALTER TABLE public.tenant_settings
  DROP CONSTRAINT IF EXISTS check_rolling_capacity_months;

ALTER TABLE public.tenant_settings
  ADD CONSTRAINT check_rolling_capacity_months 
  CHECK (rolling_capacity_months > 0 AND rolling_capacity_months <= 60);

ALTER TABLE public.tenant_settings
  DROP CONSTRAINT IF EXISTS check_default_daily_capacity;

ALTER TABLE public.tenant_settings
  ADD CONSTRAINT check_default_daily_capacity 
  CHECK (default_daily_capacity >= 0);

-- Enable RLS if not already enabled
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (if they don't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'tenant_settings' 
    AND policyname = 'Users can view their tenant settings'
  ) THEN
    CREATE POLICY "Users can view their tenant settings"
      ON public.tenant_settings
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.user_tenants
          WHERE user_tenants.tenant_id = tenant_settings.tenant_id
          AND user_tenants.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'tenant_settings' 
    AND policyname = 'Users can insert their tenant settings'
  ) THEN
    CREATE POLICY "Users can insert their tenant settings"
      ON public.tenant_settings
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_tenants
          WHERE user_tenants.tenant_id = tenant_settings.tenant_id
          AND user_tenants.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'tenant_settings' 
    AND policyname = 'Users can update their tenant settings'
  ) THEN
    CREATE POLICY "Users can update their tenant settings"
      ON public.tenant_settings
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.user_tenants
          WHERE user_tenants.tenant_id = tenant_settings.tenant_id
          AND user_tenants.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant_id 
  ON public.tenant_settings(tenant_id);

