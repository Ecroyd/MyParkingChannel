-- Migration: Add Videofit SendCapture SOAP ingest support
-- Purpose: Enable direct SOAP ingestion from Videofit Web Services

-- Add columns to tenant_anpr_config for Videofit ingest
DO $$ 
BEGIN
  -- Add videofit_ingest_enabled flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tenant_anpr_config' AND column_name = 'videofit_ingest_enabled'
  ) THEN
    ALTER TABLE tenant_anpr_config 
    ADD COLUMN videofit_ingest_enabled BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- Add videofit_ingest_token_hash (SHA256 hash of raw token)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tenant_anpr_config' AND column_name = 'videofit_ingest_token_hash'
  ) THEN
    ALTER TABLE tenant_anpr_config 
    ADD COLUMN videofit_ingest_token_hash TEXT NULL;
  END IF;
END $$;

-- Create index for enabled ingest lookups
CREATE INDEX IF NOT EXISTS idx_tenant_anpr_config_videofit_ingest_enabled 
ON tenant_anpr_config(tenant_id, videofit_ingest_enabled) 
WHERE videofit_ingest_enabled = true;
