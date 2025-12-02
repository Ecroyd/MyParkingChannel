-- TASK: Seed channels for tenants that already have APIs set up.
-- - Ensure `all`, `direct`, `web` exist.
-- - Create one channel per existing partner_api_keys (derived from name or partner_code if exists).
-- - Link partner_api_keys.channel_id to the new channels.

-- OPTIONAL: if you want to restrict this to a single tenant, set this first:
--   DO $$ BEGIN
--     RAISE EXCEPTION 'Replace TENANT_SLUG_HERE first';
--   END $$;
--
-- Then uncomment and use this filter:
--   where t.slug = 'TENANT_SLUG_HERE'
--
-- For now, this version seeds for ALL tenants that exist.

-----------------------------
-- 1) Seed default channels
-----------------------------

-- all
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

-- direct
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

-- web
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

-- agent
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

---------------------------------------------
-- 2) Create channels for existing API keys
---------------------------------------------
-- Derive partner code from name field (convert to lowercase, replace spaces/special chars with underscores)
-- This creates one channel per distinct (tenant_id, derived_code).

INSERT INTO public.tenant_channels (tenant_id, code, name, description, kind, is_default, is_active, sort_order)
SELECT
  p.tenant_id,
  LOWER(REGEXP_REPLACE(p.name, '[^a-z0-9]+', '_', 'g')) AS code,
  INITCAP(REGEXP_REPLACE(p.name, '[^a-z0-9]+', ' ', 'g')) AS name,  -- "Holiday Extras" -> "Holiday Extras"
  'Channel for ' || p.name || ' API bookings.' AS description,
  'agent' AS kind,
  false AS is_default,
  true AS is_active,
  50 AS sort_order
FROM public.partner_api_keys p
LEFT JOIN public.tenant_channels c
  ON c.tenant_id = p.tenant_id
  AND c.code = LOWER(REGEXP_REPLACE(p.name, '[^a-z0-9]+', '_', 'g'))
WHERE c.id IS NULL
  AND p.name IS NOT NULL
  AND p.name != ''
GROUP BY p.tenant_id, LOWER(REGEXP_REPLACE(p.name, '[^a-z0-9]+', '_', 'g')), p.name;

-- If partner_code column exists, also create channels from it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'partner_api_keys' 
    AND column_name = 'partner_code'
  ) THEN
    INSERT INTO public.tenant_channels (tenant_id, code, name, description, kind, is_default, is_active, sort_order)
    SELECT
      p.tenant_id,
      LOWER(p.partner_code) AS code,
      INITCAP(REPLACE(p.partner_code, '_', ' ')) AS name,  -- "holiday_extras" -> "Holiday Extras"
      'Channel for ' || INITCAP(REPLACE(p.partner_code, '_', ' ')) || ' API bookings.' AS description,
      'agent' AS kind,
      false AS is_default,
      true AS is_active,
      50 AS sort_order
    FROM public.partner_api_keys p
    LEFT JOIN public.tenant_channels c
      ON c.tenant_id = p.tenant_id
      AND c.code = LOWER(p.partner_code)
    WHERE c.id IS NULL
      AND p.partner_code IS NOT NULL
      AND p.partner_code != ''
    GROUP BY p.tenant_id, p.partner_code;
  END IF;
END $$;

--------------------------------------------------
-- 3) Link partner_api_keys -> tenant_channels
--------------------------------------------------
-- For any API key without a channel_id, attach the matching channel
-- First try to match by partner_code if it exists, otherwise by derived code from name.

-- Try matching by partner_code first (if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'partner_api_keys' 
    AND column_name = 'partner_code'
  ) THEN
    UPDATE public.partner_api_keys p
    SET channel_id = c.id
    FROM public.tenant_channels c
    WHERE p.channel_id IS NULL
      AND p.tenant_id = c.tenant_id
      AND LOWER(p.partner_code) = c.code
      AND p.partner_code IS NOT NULL
      AND p.partner_code != '';
  END IF;
END $$;

-- Then match by derived code from name for any remaining keys
UPDATE public.partner_api_keys p
SET channel_id = c.id
FROM public.tenant_channels c
WHERE p.channel_id IS NULL
  AND p.tenant_id = c.tenant_id
  AND LOWER(REGEXP_REPLACE(p.name, '[^a-z0-9]+', '_', 'g')) = c.code
  AND p.name IS NOT NULL
  AND p.name != '';

-- After this:
-- - Every tenant has at least: all, direct, web, agent.
-- - Any tenant with partner_api_keys now has a channel per partner (derived from name or partner_code).
-- - partner_api_keys.channel_id is populated, so your supplier API can pass channelCode through.

