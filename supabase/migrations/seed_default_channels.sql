-- Seed default channels for all existing tenants
-- This migration is idempotent: running it multiple times won't create duplicates

-- 1) Seed 'all' channel
INSERT INTO public.tenant_channels (tenant_id, code, name, description, kind, is_default, is_active, sort_order)
SELECT 
  t.id,
  'all' AS code,
  'All channels' AS name,
  'Fallback pricing used when no specific channel match is found.' AS description,
  'system' AS kind,
  true AS is_default,
  true AS is_active,
  10 AS sort_order
FROM public.tenants t
LEFT JOIN public.tenant_channels c
  ON c.tenant_id = t.id
  AND c.code = 'all'
WHERE c.id IS NULL;

-- 2) Seed 'direct' channel
INSERT INTO public.tenant_channels (tenant_id, code, name, description, kind, is_default, is_active, sort_order)
SELECT 
  t.id,
  'direct' AS code,
  'Direct' AS name,
  'Phone bookings, walk-ins, and admin-entered bookings.' AS description,
  'direct' AS kind,
  false AS is_default,
  true AS is_active,
  20 AS sort_order
FROM public.tenants t
LEFT JOIN public.tenant_channels c
  ON c.tenant_id = t.id
  AND c.code = 'direct'
WHERE c.id IS NULL;

-- 3) Seed 'web' channel
INSERT INTO public.tenant_channels (tenant_id, code, name, description, kind, is_default, is_active, sort_order)
SELECT 
  t.id,
  'web' AS code,
  'Web' AS name,
  'Your own website / online checkout.' AS description,
  'web' AS kind,
  false AS is_default,
  true AS is_active,
  30 AS sort_order
FROM public.tenants t
LEFT JOIN public.tenant_channels c
  ON c.tenant_id = t.id
  AND c.code = 'web'
WHERE c.id IS NULL;

-- 4) Seed 'agent' channel
INSERT INTO public.tenant_channels (tenant_id, code, name, description, kind, is_default, is_active, sort_order)
SELECT 
  t.id,
  'agent' AS code,
  'Agent' AS name,
  'Default channel for agent/partner bookings when no specific channel is set.' AS description,
  'agent' AS kind,
  false AS is_default,
  true AS is_active,
  40 AS sort_order
FROM public.tenants t
LEFT JOIN public.tenant_channels c
  ON c.tenant_id = t.id
  AND c.code = 'agent'
WHERE c.id IS NULL;

