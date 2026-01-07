-- Migration: Create staff_vehicles table
-- Purpose: Allow staff vehicles to always enter the car park via ANPR

CREATE TABLE IF NOT EXISTS staff_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(tenant_id, plate)
);

-- Create index for fast lookups by tenant and plate
CREATE INDEX IF NOT EXISTS idx_staff_vehicles_tenant_plate ON staff_vehicles(tenant_id, plate);
CREATE INDEX IF NOT EXISTS idx_staff_vehicles_tenant_active ON staff_vehicles(tenant_id, is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE staff_vehicles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role can do everything (for admin operations)
CREATE POLICY "Service role can do everything on staff_vehicles" ON staff_vehicles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS Policy: Users can access staff vehicles for their tenants
CREATE POLICY "Users can access staff vehicles for their tenants" ON staff_vehicles
  FOR ALL TO authenticated USING (
    tenant_id IN (
      SELECT tenant_id FROM user_tenants 
      WHERE user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_staff_vehicles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER staff_vehicles_updated_at
  BEFORE UPDATE ON staff_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_staff_vehicles_updated_at();

