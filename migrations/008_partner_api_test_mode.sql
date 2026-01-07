-- Migration: Add is_test column to partner_api_keys table
-- This allows creating test API keys for partner integrations like CAVU

-- Add is_test column with default false (existing keys are production)
ALTER TABLE partner_api_keys
ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN partner_api_keys.is_test IS 'Indicates if this is a test API key for partner testing purposes';

-- Create index for filtering test keys
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_is_test ON partner_api_keys(is_test);
