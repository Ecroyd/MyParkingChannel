-- Debug authentication context
-- Run this to see what user context the functions are running under

-- Check current user context
SELECT auth.uid() as current_user_id;

-- Check if the current user has access to the tenant
SELECT 
    ut.user_id,
    ut.tenant_id,
    ut.role,
    ut.is_default,
    t.name as tenant_name
FROM user_tenants ut
JOIN tenants t ON t.id = ut.tenant_id
WHERE ut.user_id = auth.uid()
    AND ut.tenant_id = 'ff6b276d-45c8-48b7-87a9-5fb91528c68a';

-- Check what bookings exist for this tenant
SELECT COUNT(*) as booking_count
FROM bookings 
WHERE tenant_id = 'ff6b276d-45c8-48b7-87a9-5fb91528c68a';
