-- Migration: Create anpr_events table and add anpr_status to bookings
-- Purpose: Store ANPR camera reads and track arrival/departure status on bookings

-- Create anpr_events table
CREATE TABLE IF NOT EXISTS anpr_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id UUID NULL REFERENCES anpr_sites(id) ON DELETE SET NULL,
  camera_id TEXT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out', 'unknown')),
  event_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  plate_raw TEXT NOT NULL,
  plate_normalized TEXT NOT NULL,
  confidence NUMERIC NULL,
  snapshot_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched', 'corrected', 'ignored')),
  booking_id UUID NULL REFERENCES bookings(id) ON DELETE SET NULL,
  corrected_plate TEXT NULL,
  corrected_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  corrected_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_anpr_events_tenant_status_event_at ON anpr_events(tenant_id, status, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_anpr_events_tenant_plate_event_at ON anpr_events(tenant_id, plate_normalized, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_anpr_events_booking_id ON anpr_events(booking_id) WHERE booking_id IS NOT NULL;

-- Enable RLS
ALTER TABLE anpr_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role can do everything
CREATE POLICY "Service role can do everything on anpr_events" ON anpr_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS Policy: Tenant admins can view and update their tenant's events
CREATE POLICY "Tenant admins can manage their anpr_events" ON anpr_events
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

-- Add anpr_status column to bookings if it doesn't exist
-- Note: We reuse checked_in_at and checked_out_at instead of adding arrived_at/departed_at
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bookings' AND column_name = 'anpr_status'
  ) THEN
    ALTER TABLE bookings ADD COLUMN anpr_status TEXT NULL 
      CHECK (anpr_status IN ('not_arrived', 'on_site', 'departed')) 
      DEFAULT 'not_arrived';
    
    -- Set initial status based on existing checked_in_at/checked_out_at
    UPDATE bookings 
    SET anpr_status = CASE
      WHEN checked_out_at IS NOT NULL THEN 'departed'
      WHEN checked_in_at IS NOT NULL THEN 'on_site'
      ELSE 'not_arrived'
    END
    WHERE anpr_status IS NULL;
  END IF;
END $$;

-- Create index on anpr_status for filtering
CREATE INDEX IF NOT EXISTS idx_bookings_anpr_status ON bookings(tenant_id, anpr_status) WHERE anpr_status IS NOT NULL;


