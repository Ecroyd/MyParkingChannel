-- system_health_status: cron/scheduler writes; admin UI can read (RLS) with revalidate: 60 to avoid function invocations.
-- key: 'canary' | 'email_parse' | 'cavu'
-- tenant_id: NULL = platform-level (canary). For canary we use partial unique on key so one row per key when tenant_id IS NULL.

CREATE TABLE IF NOT EXISTS system_health_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per (tenant_id, key) when tenant_id is set; one row per key when tenant_id IS NULL
CREATE UNIQUE INDEX idx_system_health_status_tenant_key
  ON system_health_status (tenant_id, key)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX idx_system_health_status_platform_key
  ON system_health_status (key)
  WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_system_health_status_updated_at
  ON system_health_status (updated_at DESC);

COMMENT ON TABLE system_health_status IS 'Health snapshot written by crons; admin UI reads via RLS (revalidate: 60).';

-- RLS: admin/owner can read their tenant's rows and platform (tenant_id IS NULL). Service role (crons) bypasses RLS for writes.
ALTER TABLE system_health_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read own tenant and platform health"
  ON system_health_status
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id IN (
      SELECT tenant_id FROM user_tenants
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'owner')
    )
  );
