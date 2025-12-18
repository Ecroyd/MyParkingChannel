-- Add rolling window configuration for ANPR whitelist CSV generation
-- Migration: 004_add_anpr_whitelist_window.sql

ALTER TABLE tenant_anpr_config
ADD COLUMN IF NOT EXISTS whitelist_lookahead_days INTEGER NOT NULL DEFAULT 7,
ADD COLUMN IF NOT EXISTS whitelist_keep_after_end_hours INTEGER NOT NULL DEFAULT 24;

COMMENT ON COLUMN tenant_anpr_config.whitelist_lookahead_days IS 'Number of days ahead to include bookings in whitelist CSV';
COMMENT ON COLUMN tenant_anpr_config.whitelist_keep_after_end_hours IS 'Number of hours after booking end to keep in whitelist CSV';

