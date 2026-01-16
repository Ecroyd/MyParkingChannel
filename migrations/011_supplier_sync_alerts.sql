-- Migration: Create supplier_sync_alerts and tenant_alert_routes tables
-- Purpose: Alerting system for supplier sync failures and stale runs

-- Create tenant_alert_routes table (where to send alerts)
CREATE TABLE IF NOT EXISTS tenant_alert_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'webhook')),
  destination TEXT NOT NULL, -- email address or webhook URL
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NULL, -- provider-specific config (e.g., email provider, webhook headers)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, kind, destination)
);

-- Create supplier_sync_alerts table (alert records)
-- Note: Table may already exist with this schema:
--   meta jsonb not null default '{}'::jsonb
--   unique index on (tenant_id, supplier_code, fingerprint)
CREATE TABLE IF NOT EXISTS supplier_sync_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_code TEXT NOT NULL,
  run_id UUID NULL REFERENCES supplier_sync_runs(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'error',
  fingerprint TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL
);

-- Prevent duplicate spam for same issue (may already exist)
CREATE UNIQUE INDEX IF NOT EXISTS supplier_sync_alerts_fingerprint_uidx
  ON supplier_sync_alerts (tenant_id, supplier_code, fingerprint);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tenant_alert_routes_tenant_enabled ON tenant_alert_routes(tenant_id, is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_supplier_sync_alerts_tenant_supplier ON supplier_sync_alerts(tenant_id, supplier_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_sync_alerts_sent_at ON supplier_sync_alerts(sent_at) WHERE sent_at IS NULL;

-- Enable RLS
ALTER TABLE tenant_alert_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_sync_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant_alert_routes
CREATE POLICY "Service role can do everything on tenant_alert_routes" ON tenant_alert_routes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Tenant admins can manage their alert routes" ON tenant_alert_routes
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

-- RLS Policies for supplier_sync_alerts
CREATE POLICY "Service role can do everything on supplier_sync_alerts" ON supplier_sync_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Tenant admins can view their alerts" ON supplier_sync_alerts
  FOR SELECT TO authenticated USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'owner')
    )
  );
