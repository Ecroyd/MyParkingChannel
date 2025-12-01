-- Add gate_status column to bookings table
-- Run this in your Supabase SQL Editor

-- Add the gate_status column
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS gate_status VARCHAR(20) DEFAULT 'reserved';

-- Add a check constraint to ensure only valid values
ALTER TABLE bookings
ADD CONSTRAINT check_gate_status 
CHECK (gate_status IN ('reserved', 'arrived', 'departed', 'cancelled'));

-- Update existing records based on current timestamps and status
UPDATE bookings
SET gate_status = CASE
    WHEN checked_out_at IS NOT NULL THEN 'departed'
    WHEN checked_in_at IS NOT NULL THEN 'arrived'
    WHEN status = 'cancelled' THEN 'cancelled'
    ELSE 'reserved'
END
WHERE gate_status IS NULL OR gate_status = 'reserved';

-- Add an index for better query performance
CREATE INDEX IF NOT EXISTS idx_bookings_gate_status ON bookings(gate_status);

-- Add a comment to document the column
COMMENT ON COLUMN bookings.gate_status IS 'Gate status: reserved, arrived, departed, or cancelled. This is the manual gate status set by staff, independent of timestamps.';

-- Optional: Create a trigger to automatically update gate_status when timestamps change
-- This is a backup in case code doesn't update gate_status explicitly
-- Note: The trigger will only update if gate_status is NULL or if timestamps change
CREATE OR REPLACE FUNCTION update_gate_status_from_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update gate_status if it's not being explicitly set (i.e., it's NULL or unchanged)
  -- This allows manual updates to gate_status to take precedence
  IF NEW.gate_status IS NULL OR NEW.gate_status = OLD.gate_status THEN
    IF NEW.checked_out_at IS NOT NULL THEN
      NEW.gate_status := 'departed';
    ELSIF NEW.checked_in_at IS NOT NULL THEN
      NEW.gate_status := 'arrived';
    ELSIF NEW.status = 'cancelled' THEN
      NEW.gate_status := 'cancelled';
    ELSE
      NEW.gate_status := 'reserved';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_update_gate_status_from_timestamps ON bookings;
CREATE TRIGGER trigger_update_gate_status_from_timestamps
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  WHEN (
    OLD.checked_in_at IS DISTINCT FROM NEW.checked_in_at OR
    OLD.checked_out_at IS DISTINCT FROM NEW.checked_out_at OR
    OLD.status IS DISTINCT FROM NEW.status
  )
  EXECUTE FUNCTION update_gate_status_from_timestamps();

