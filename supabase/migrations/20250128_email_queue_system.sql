-- Email Queue System Migration
-- Creates tables for email provider settings, tenant email settings, and email outbox queue

-- 1. email_provider_settings (platform-level)
CREATE TABLE IF NOT EXISTS email_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('resend')),
  resend_api_key_encrypted text NOT NULL,
  default_from_email text NOT NULL,
  default_from_name text NOT NULL,
  default_reply_to text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. tenant_email_settings (per-tenant)
CREATE TABLE IF NOT EXISTS tenant_email_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  from_name text,
  reply_to text,
  sender_domain_mode text NOT NULL DEFAULT 'platform' CHECK (sender_domain_mode IN ('platform', 'tenant_domain')),
  tenant_from_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. email_outbox (queue)
CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  to_name text,
  from_email text NOT NULL,
  from_name text NOT NULL,
  reply_to text,
  subject text NOT NULL,
  template_key text NOT NULL,
  template_version int NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'bounced', 'failed')),
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  dedupe_key text UNIQUE,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for email_outbox
CREATE INDEX IF NOT EXISTS idx_email_outbox_status_next_attempt 
  ON email_outbox(status, next_attempt_at) 
  WHERE status IN ('queued', 'failed');

CREATE INDEX IF NOT EXISTS idx_email_outbox_tenant_created 
  ON email_outbox(tenant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_email_outbox_provider_message_id 
  ON email_outbox(provider_message_id) 
  WHERE provider_message_id IS NOT NULL;

-- Updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_email_provider_settings_updated_at
  BEFORE UPDATE ON email_provider_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_email_settings_updated_at
  BEFORE UPDATE ON tenant_email_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_outbox_updated_at
  BEFORE UPDATE ON email_outbox
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS policies (if RLS is enabled)
ALTER TABLE email_provider_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;

-- Platform admins can manage email_provider_settings
CREATE POLICY "Platform admins can manage email_provider_settings"
  ON email_provider_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE user_id = auth.uid()
    )
  );

-- Tenants can view their own email settings
CREATE POLICY "Tenants can view their email settings"
  ON tenant_email_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_tenants 
      WHERE tenant_id = tenant_email_settings.tenant_id 
      AND user_id = auth.uid()
    )
  );

-- Tenants can update their own email settings
CREATE POLICY "Tenants can update their email settings"
  ON tenant_email_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_tenants 
      WHERE tenant_id = tenant_email_settings.tenant_id 
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Tenants can view their own email outbox
CREATE POLICY "Tenants can view their email outbox"
  ON email_outbox
  FOR SELECT
  USING (
    tenant_id IS NULL OR
    EXISTS (
      SELECT 1 FROM user_tenants 
      WHERE tenant_id = email_outbox.tenant_id 
      AND user_id = auth.uid()
    )
  );

-- Platform admins can view all email outbox
CREATE POLICY "Platform admins can view all email outbox"
  ON email_outbox
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins 
      WHERE user_id = auth.uid()
    )
  );
