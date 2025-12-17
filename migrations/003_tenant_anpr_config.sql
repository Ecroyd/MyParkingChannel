-- Migration: tenant_anpr_config table
-- Creates configuration table for ANPR integration per tenant

CREATE TABLE IF NOT EXISTS tenant_anpr_config (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  dedupe_seconds INTEGER DEFAULT 60, -- Deduplication window in seconds
  offline_after_minutes INTEGER DEFAULT 15, -- Device considered offline after this many minutes
  camera_direction_map JSONB DEFAULT '{}'::jsonb, -- Maps camera_id to direction (entry/exit)
  arrival_grace_minutes INTEGER DEFAULT 240, -- 4 hours early tolerance for arrivals
  departure_grace_minutes INTEGER DEFAULT 480, -- 8 hours late tolerance for departures
  csv_token_hash TEXT, -- SHA256 hash of CSV export token for unauthenticated access
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add unique constraint on tenant_id (already primary key, but explicit)
-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tenant_anpr_config_tenant_id ON tenant_anpr_config(tenant_id);

-- Add RLS policy
ALTER TABLE tenant_anpr_config ENABLE ROW LEVEL SECURITY;

-- Policy: Users can access ANPR config for their tenants
CREATE POLICY "Users can access tenant ANPR config" ON tenant_anpr_config
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid()
    )
  );

-- Add unique constraint on integration_events for tenant_id + idempotency_key deduplication
-- This ensures we don't process the same event twice
DO $$
BEGIN
  -- Check if unique constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'integration_events_tenant_idempotency_unique'
  ) THEN
    ALTER TABLE integration_events 
    ADD CONSTRAINT integration_events_tenant_idempotency_unique 
    UNIQUE (tenant_id, idempotency_key);
  END IF;
END $$;
