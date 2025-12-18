-- Add booking_external_payloads table and new booking columns
-- Migration: 005_add_booking_external_payloads.sql

-- Add new columns to bookings table for return flight and terminal info
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS return_flight_number TEXT,
ADD COLUMN IF NOT EXISTS returning_from TEXT,
ADD COLUMN IF NOT EXISTS outbound_terminal TEXT,
ADD COLUMN IF NOT EXISTS return_terminal TEXT;

-- Create booking_external_payloads table to store full external booking payloads
CREATE TABLE IF NOT EXISTS booking_external_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  reference TEXT NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, source, reference)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_booking_external_payloads_tenant_source ON booking_external_payloads(tenant_id, source);
CREATE INDEX IF NOT EXISTS idx_booking_external_payloads_booking_id ON booking_external_payloads(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_external_payloads_reference ON booking_external_payloads(reference);

-- Enable RLS
ALTER TABLE booking_external_payloads ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can access payloads for bookings in their tenants
CREATE POLICY "Users can access booking external payloads" ON booking_external_payloads
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE booking_external_payloads IS 'Stores full external booking payloads (e.g., from CAVU API) for debugging and reference';
COMMENT ON COLUMN booking_external_payloads.source IS 'Source system identifier (e.g., "cavu")';
COMMENT ON COLUMN booking_external_payloads.reference IS 'External booking reference';
COMMENT ON COLUMN booking_external_payloads.payload IS 'Full JSON payload from external system';
