-- Debug SQL queries for tenant_domains table
-- Run these in your Supabase SQL editor to check the current state

-- 1. Check if the domain exists in tenant_domains
SELECT 
  td.id,
  td.tenant_id,
  td.domain,
  td.is_primary,
  td.verified,
  td.created_at,
  t.slug,
  t.name,
  t.status
FROM tenant_domains td
JOIN tenants t ON td.tenant_id = t.id
WHERE td.domain = 'parkingexeterairport.co.uk';

-- 2. Check all domains for the flyparksexeter tenant
SELECT 
  td.id,
  td.domain,
  td.is_primary,
  td.verified,
  td.created_at
FROM tenant_domains td
JOIN tenants t ON td.tenant_id = t.id
WHERE t.slug = 'flyparksexeter';

-- 3. Check the tenant details
SELECT 
  id,
  slug,
  name,
  status,
  created_at
FROM tenants 
WHERE slug = 'flyparksexeter';

-- 4. If the domain doesn't exist, create it:
-- INSERT INTO tenant_domains (tenant_id, domain, is_primary, verified)
-- VALUES (
--   (SELECT id FROM tenants WHERE slug = 'flyparksexeter'),
--   'parkingexeterairport.co.uk',
--   true,
--   true
-- );

-- 5. Check the structure of tenant_public_profile table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'tenant_public_profile' 
ORDER BY ordinal_position;

-- 6. Check if there are any tenant_public_profile records
SELECT 
  tpp.tenant_id,
  tpp.business_name,
  tpp.is_active,
  tpp.status,
  t.slug,
  t.name
FROM tenant_public_profile tpp
JOIN tenants t ON tpp.tenant_id = t.id
WHERE t.slug = 'flyparksexeter';

-- 6. If no tenant_public_profile exists, create one:
-- INSERT INTO tenant_public_profile (tenant_id, is_active, status)
-- VALUES (
--   (SELECT id FROM tenants WHERE slug = 'flyparksexeter'),
--   true,
--   'active'
-- );
