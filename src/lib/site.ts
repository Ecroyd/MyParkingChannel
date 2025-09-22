import { createServerClientDirect } from "@/lib/supabase/server-direct";

export async function getTenantContext(slug: string) {
  if (!slug) return null;
  const sb = createServerClientDirect({ admin: true });

  const { data: tenant, error: tErr } = await sb
    .from("tenants")
    .select("id, slug, name, site_hero_title, site_hero_subtitle, brand_primary, brand_secondary, brand_logo_url")
    .eq("slug", slug)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!tenant) return null;

  const { data: branding } = await sb
    .from("tenant_branding")
    .select(`
      app_name, 
      short_name, 
      theme_color, 
      background_color, 
      icon_192_url, 
      icon_512_url, 
      maskable_512_url,
      contact_email,
      contact_phone,
      contact_address,
      contact_city,
      contact_postcode,
      contact_country,
      business_hours,
      website_url,
      social_media
    `)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  return { tenant, branding: branding || null };
}

// Back-compat for older /sites/[slug] pages:
export async function getSiteContext(
  slug: string,
  _opts: { preview?: boolean } = {}
) {
  // same behaviour as getTenantContext for our MVP
  return getTenantContext(slug);
}
