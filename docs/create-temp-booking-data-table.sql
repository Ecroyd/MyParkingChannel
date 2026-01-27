-- Create table for temporary booking data storage
-- This table stores booking data temporarily before Stripe payment completion
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS temp_booking_data (
  id TEXT PRIMARY KEY, -- Format: {tenantId}_{reference}
  tenant_id UUID NOT NULL,
  reference TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  plate TEXT,
  flight_number TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  amount DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_temp_booking_data_tenant_reference 
  ON temp_booking_data(tenant_id, reference);

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_temp_booking_data_expires_at 
  ON temp_booking_data(expires_at);

-- Enable Row Level Security (optional, but recommended)
ALTER TABLE temp_booking_data ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role to access all rows
-- Note: This uses service role key which bypasses RLS, but it's good practice
CREATE POLICY "Service role can manage temp booking data"
  ON temp_booking_data
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Optional: Create a function to automatically clean up expired entries
CREATE OR REPLACE FUNCTION cleanup_expired_temp_bookings()
RETURNS void AS $$
BEGIN
  DELETE FROM temp_booking_data
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Optional: Schedule cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-temp-bookings', '0 * * * *', 'SELECT cleanup_expired_temp_bookings();');
