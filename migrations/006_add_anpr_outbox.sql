-- Create ANPR outbox table for relay/polling approach
-- Migration: 006_add_anpr_outbox.sql

CREATE TABLE IF NOT EXISTS anpr_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  plate TEXT NOT NULL,
  group_number INTEGER NOT NULL DEFAULT 4,
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
  valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('upsert', 'delete')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE,
  retry_count INTEGER DEFAULT 0 NOT NULL,
  error_message TEXT,
  
  -- Indexes for efficient polling
);

-- Index for polling: get pending items for a tenant, ordered by created_at
CREATE INDEX IF NOT EXISTS idx_anpr_outbox_tenant_status_created 
  ON anpr_outbox(tenant_id, status, created_at) 
  WHERE status = 'pending';

-- Index for cleanup: find old completed items
CREATE INDEX IF NOT EXISTS idx_anpr_outbox_status_processed 
  ON anpr_outbox(status, processed_at) 
  WHERE status = 'completed';

COMMENT ON TABLE anpr_outbox IS 'Queue of vehicle updates for ANPR systems to poll';
COMMENT ON COLUMN anpr_outbox.status IS 'pending: waiting to be polled, processing: currently being processed, completed: acknowledged, failed: error occurred';
COMMENT ON COLUMN anpr_outbox.retry_count IS 'Number of times this item has been retried';
