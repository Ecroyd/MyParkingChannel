-- Migration: Create anpr_sites table for SNAP/Videofit ANPR relay configuration
-- Purpose: Store per-tenant ANPR relay settings with secure token hashing

CREATE TABLE IF NOT EXISTS anpr_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Main Site',
  enabled BOOLEAN NOT NULL DEFAULT false,
  relay_token_hash TEXT NOT NULL,  -- SHA256 hash of relay token (never store raw)
  loc_pc_no INT NOT NULL DEFAULT 998,
  site_client_license BIGINT NULL,
  default_group INT NOT NULL DEFAULT 4,
  include_upcoming_hours INT NOT NULL DEFAULT 48,
  grace_after_end_hours INT NOT NULL DEFAULT 12,
  min_snapshot_plates INT NOT NULL DEFAULT 10,
  allow_small_snapshot_manual BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id)  -- One site per tenant for now
);

-- Create index for fast lookups by tenant
CREATE INDEX IF NOT EXISTS idx_anpr_sites_tenant_id ON anpr_sites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_anpr_sites_enabled ON anpr_sites(tenant_id, enabled) WHERE enabled = true;

-- Enable RLS
ALTER TABLE anpr_sites ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role can do everything (for admin operations)
CREATE POLICY "Service role can do everything on anpr_sites" ON anpr_sites
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS Policy: Tenant admins can CRUD their tenant's anpr_sites
CREATE POLICY "Tenant admins can manage their anpr_sites" ON anpr_sites
  FOR ALL TO authenticated USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  ) WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_anpr_sites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER anpr_sites_updated_at
  BEFORE UPDATE ON anpr_sites
  FOR EACH ROW
  EXECUTE FUNCTION update_anpr_sites_updated_at();

-- Note: If anpr_outbox table doesn't have 'type' and 'reason' columns, add them:
-- ALTER TABLE anpr_outbox ADD COLUMN IF NOT EXISTS type TEXT;
-- ALTER TABLE anpr_outbox ADD COLUMN IF NOT EXISTS reason TEXT;
