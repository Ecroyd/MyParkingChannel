-- Migration: Create RPC function for atomically claiming ANPR outbox items
-- Purpose: Requeue stale items and claim pending items with FOR UPDATE SKIP LOCKED

CREATE OR REPLACE FUNCTION anpr_outbox_claim(
  p_tenant_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  booking_id UUID,
  plate TEXT,
  group_number INTEGER,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  action TEXT,
  created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_stale_cutoff TIMESTAMPTZ;
BEGIN
  -- Calculate cutoff for stale items (10 minutes ago)
  v_stale_cutoff := NOW() - INTERVAL '10 minutes';
  
  -- Step 1: Requeue stale processing items back to pending
  -- Items that have been in 'processing' status for more than 10 minutes
  UPDATE anpr_outbox
  SET 
    status = 'pending',
    retry_count = COALESCE(retry_count, 0) + 1,
    error_message = NULL,
    updated_at = NOW()
  WHERE 
    tenant_id = p_tenant_id
    AND status = 'processing'
    AND updated_at < v_stale_cutoff;
  
  -- Step 2: Select and claim pending items using FOR UPDATE SKIP LOCKED
  -- This ensures only one process can claim each row
  -- Use a CTE to lock rows, then update them
  RETURN QUERY
  WITH locked_rows AS (
    SELECT id
    FROM anpr_outbox
    WHERE 
      tenant_id = p_tenant_id
      AND status = 'pending'
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE anpr_outbox o
  SET 
    status = 'processing',
    updated_at = NOW()
  FROM locked_rows lr
  WHERE o.id = lr.id
  RETURNING 
    o.id,
    o.booking_id,
    o.plate,
    o.group_number,
    o.valid_from,
    o.valid_until,
    o.action,
    o.created_at;
END;
$$;

-- Grant execute permission to service role (for API routes)
GRANT EXECUTE ON FUNCTION anpr_outbox_claim(UUID, INTEGER) TO service_role;

