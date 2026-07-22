-- Optional homepage presentation JSON for tenant websites.
-- Prefer content blocks for section copy; this holds section visibility + footer extras.

ALTER TABLE public.site_seo_settings
  ADD COLUMN IF NOT EXISTS presentation_json jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.site_seo_settings.presentation_json IS
  'Tenant website presentation: section visibility, footer description, optional hero overrides. Not Flyparks-specific.';
