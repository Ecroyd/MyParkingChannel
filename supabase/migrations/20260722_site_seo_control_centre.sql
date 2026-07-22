-- Site SEO control centre: extend site_pages, add site_seo_settings + site_redirects,
-- tighten tenant-scoped RLS. Preserves existing site_pages.content_md and rows.

-- ---------------------------------------------------------------------------
-- site_pages: SEO + content columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.site_pages
  ADD COLUMN IF NOT EXISTS page_key text,
  ADD COLUMN IF NOT EXISTS h1 text,
  ADD COLUMN IF NOT EXISTS excerpt text,
  ADD COLUMN IF NOT EXISTS content_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS meta_description text,
  ADD COLUMN IF NOT EXISTS canonical_path text,
  ADD COLUMN IF NOT EXISTS robots_index boolean,
  ADD COLUMN IF NOT EXISTS robots_follow boolean,
  ADD COLUMN IF NOT EXISTS og_title text,
  ADD COLUMN IF NOT EXISTS og_description text,
  ADD COLUMN IF NOT EXISTS og_image_url text,
  ADD COLUMN IF NOT EXISTS nav_label text,
  ADD COLUMN IF NOT EXISTS nav_order integer,
  ADD COLUMN IF NOT EXISTS show_in_navigation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.site_pages
  DROP CONSTRAINT IF EXISTS site_pages_status_check;
ALTER TABLE public.site_pages
  ADD CONSTRAINT site_pages_status_check
  CHECK (status IN ('draft', 'published', 'archived'));

CREATE UNIQUE INDEX IF NOT EXISTS site_pages_site_path_uidx
  ON public.site_pages (site_id, path);

CREATE UNIQUE INDEX IF NOT EXISTS site_pages_site_page_key_uidx
  ON public.site_pages (site_id, page_key)
  WHERE page_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS site_pages_site_status_idx
  ON public.site_pages (site_id, status);

-- ---------------------------------------------------------------------------
-- site_seo_settings: genuinely site-wide SEO defaults / integrations / migration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_seo_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  website_name text,
  alternative_site_name text,
  default_title_template text,
  default_meta_description text,
  default_og_image_url text,
  default_robots_index boolean NOT NULL DEFAULT true,
  default_robots_follow boolean NOT NULL DEFAULT true,
  primary_language text NOT NULL DEFAULT 'en-GB',
  allow_indexing boolean NOT NULL DEFAULT true,
  schema_business_type text NOT NULL DEFAULT 'ParkingFacility',
  logo_url text,
  favicon_url text,
  -- indexing / migration modes: live_indexable | staging_noindex | canonical_to_existing
  indexing_mode text NOT NULL DEFAULT 'live_indexable',
  migration_target_domain text,
  migration_notes text,
  canonical_domain_override text,
  -- integrations (non-secret verification / measurement IDs)
  google_search_console_verification text,
  ga4_measurement_id text,
  google_tag_manager_id text,
  bing_verification text,
  microsoft_clarity_id text,
  cookie_consent_mode text NOT NULL DEFAULT 'basic',
  last_published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_seo_settings_site_uidx UNIQUE (site_id),
  CONSTRAINT site_seo_settings_indexing_mode_check
    CHECK (indexing_mode IN ('live_indexable', 'staging_noindex', 'canonical_to_existing')),
  CONSTRAINT site_seo_settings_cookie_mode_check
    CHECK (cookie_consent_mode IN ('off', 'basic', 'strict'))
);

CREATE INDEX IF NOT EXISTS site_seo_settings_tenant_idx
  ON public.site_seo_settings (tenant_id);

-- ---------------------------------------------------------------------------
-- site_redirects: tenant/site-scoped path redirects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  old_path text NOT NULL,
  new_path text NOT NULL,
  status_code integer NOT NULL DEFAULT 301,
  active boolean NOT NULL DEFAULT true,
  hit_count bigint NOT NULL DEFAULT 0,
  last_hit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_redirects_status_check CHECK (status_code IN (301, 302)),
  CONSTRAINT site_redirects_old_path_format CHECK (old_path LIKE '/%'),
  CONSTRAINT site_redirects_no_self CHECK (old_path <> new_path)
);

CREATE UNIQUE INDEX IF NOT EXISTS site_redirects_site_old_path_uidx
  ON public.site_redirects (site_id, old_path);

CREATE INDEX IF NOT EXISTS site_redirects_site_active_idx
  ON public.site_redirects (site_id, active);

-- ---------------------------------------------------------------------------
-- tenant_public_profile: optional local-business extensions (non-duplicative)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenant_public_profile
  ADD COLUMN IF NOT EXISTS alternative_name text,
  ADD COLUMN IF NOT EXISTS county text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'GB',
  ADD COLUMN IF NOT EXISTS external_review_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS business_description text;

-- Keep geo in sync when latitude/longitude are set (compatibility)
CREATE OR REPLACE FUNCTION public.sync_tenant_public_profile_geo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geo := jsonb_build_object('lat', NEW.latitude, 'lng', NEW.longitude);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_tenant_public_profile_geo ON public.tenant_public_profile;
CREATE TRIGGER trg_sync_tenant_public_profile_geo
  BEFORE INSERT OR UPDATE ON public.tenant_public_profile
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tenant_public_profile_geo();

-- ---------------------------------------------------------------------------
-- updated_at helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_pages_updated_at ON public.site_pages;
CREATE TRIGGER trg_site_pages_updated_at
  BEFORE UPDATE ON public.site_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_site_seo_settings_updated_at ON public.site_seo_settings;
CREATE TRIGGER trg_site_seo_settings_updated_at
  BEFORE UPDATE ON public.site_seo_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_site_redirects_updated_at ON public.site_redirects;
CREATE TRIGGER trg_site_redirects_updated_at
  BEFORE UPDATE ON public.site_redirects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.site_seo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- Public read of published pages (for marketing site)
DROP POLICY IF EXISTS site_pages_public_read ON public.site_pages;
CREATE POLICY site_pages_public_read ON public.site_pages
  FOR SELECT
  USING (
    status = 'published'
    OR EXISTS (
      SELECT 1 FROM public.user_tenants ut
      JOIN public.sites s ON s.id = site_pages.site_id
      WHERE ut.tenant_id = s.tenant_id AND ut.user_id = auth.uid()
    )
  );

-- Tenant members manage their site pages (replace overly broad ALL if present)
DROP POLICY IF EXISTS site_pages_rw ON public.site_pages;
DROP POLICY IF EXISTS site_pages_tenant_write ON public.site_pages;
CREATE POLICY site_pages_tenant_write ON public.site_pages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.user_tenants ut ON ut.tenant_id = s.tenant_id
      WHERE s.id = site_pages.site_id AND ut.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sites s
      JOIN public.user_tenants ut ON ut.tenant_id = s.tenant_id
      WHERE s.id = site_pages.site_id AND ut.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS site_seo_settings_public_read ON public.site_seo_settings;
CREATE POLICY site_seo_settings_public_read ON public.site_seo_settings
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS site_seo_settings_tenant_write ON public.site_seo_settings;
CREATE POLICY site_seo_settings_tenant_write ON public.site_seo_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.tenant_id = site_seo_settings.tenant_id AND ut.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.tenant_id = site_seo_settings.tenant_id AND ut.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS site_redirects_public_read ON public.site_redirects;
CREATE POLICY site_redirects_public_read ON public.site_redirects
  FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS site_redirects_tenant_write ON public.site_redirects;
CREATE POLICY site_redirects_tenant_write ON public.site_redirects
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.tenant_id = site_redirects.tenant_id AND ut.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_tenants ut
      WHERE ut.tenant_id = site_redirects.tenant_id AND ut.user_id = auth.uid()
    )
  );

-- Tighten tenant_public_profile: remove open authenticated write; keep public read of active + tenant write
DROP POLICY IF EXISTS "Authenticated users can insert tenant profiles" ON public.tenant_public_profile;
DROP POLICY IF EXISTS "Authenticated users can update tenant profiles" ON public.tenant_public_profile;
DROP POLICY IF EXISTS "Authenticated users can view tenant profiles" ON public.tenant_public_profile;

GRANT SELECT ON public.site_seo_settings TO anon, authenticated;
GRANT SELECT ON public.site_redirects TO anon, authenticated;
GRANT SELECT ON public.site_pages TO anon, authenticated;
GRANT ALL ON public.site_seo_settings TO authenticated;
GRANT ALL ON public.site_redirects TO authenticated;
GRANT ALL ON public.site_pages TO authenticated;
