-- Utility SQL: Unstick all processing items for a tenant
-- Run this manually if needed to reset stuck items
-- 
-- Usage: Replace 'bab45dab-19e8-4230-b18e-ee1f663608e5' with your tenant_id
-- 
-- This resets all processing items back to pending, clearing leases

-- Example for specific tenant:
-- update public.anpr_outbox
-- set status = 'pending',
--     leased_at = null,
--     lease_expires_at = null
-- where tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
--   and processed_at is null
--   and status = 'processing';

-- Note: This is a utility query, not a migration
-- Run it manually in Supabase SQL editor when needed

