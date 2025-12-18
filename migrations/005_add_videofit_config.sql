-- Add Videofit integration configuration to tenant_anpr_config
-- Migration: 005_add_videofit_config.sql

ALTER TABLE tenant_anpr_config
ADD COLUMN IF NOT EXISTS videofit_api_url TEXT,
ADD COLUMN IF NOT EXISTS videofit_username TEXT,
ADD COLUMN IF NOT EXISTS videofit_password TEXT;

COMMENT ON COLUMN tenant_anpr_config.videofit_api_url IS 'Videofit SendDbBulkUpdateWebService.asmx endpoint URL';
COMMENT ON COLUMN tenant_anpr_config.videofit_username IS 'Videofit basic auth username (optional)';
COMMENT ON COLUMN tenant_anpr_config.videofit_password IS 'Videofit basic auth password (optional)';
