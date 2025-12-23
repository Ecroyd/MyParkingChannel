-- Migration: Add lease columns to anpr_outbox table
-- Purpose: Support explicit lease expiry timestamps for lease model

-- Add lease columns if they don't exist
ALTER TABLE anpr_outbox 
  ADD COLUMN IF NOT EXISTS leased_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

-- Create index for efficient lease expiry queries
CREATE INDEX IF NOT EXISTS idx_anpr_outbox_lease_expires_at 
  ON anpr_outbox(tenant_id, lease_expires_at) 
  WHERE status = 'processing' AND lease_expires_at IS NOT NULL;

