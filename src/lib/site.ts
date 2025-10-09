import { createServerClientDirect } from "@/lib/supabase/server-direct";

export async function getTenantContext(slug: string) {
  if (!slug) return null;
  const sb = createServerClientDirect({ admin: true });

  const { data: tenant, error: tErr } = await sb
    .from("tenants")
    .select("id, slug, name, site_hero_title, site_hero_subtitle, brand_primary, brand_secondary, brand_logo_url, status")
    .eq("slug", slug)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!tenant) return null;
  
  // Get tenant profile to check publish status
  const { data: profile } = await sb
    .from("tenant_public_profile")
    .select("is_active, status")
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  // Check if site is published - tenant must be active, profile is optional
  const isPublished = 
    tenant.status === 'active' && 
    (profile === null || profile?.is_active === true || profile?.status === 'active');
  
  if (!isPublished) {
    return null;
  }

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
