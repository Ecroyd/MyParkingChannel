import { createServerClientDirect } from "@/lib/supabase/server-direct";

export async function getTenantContext(slug: string) {
  if (!slug) return null;
  const sb = createServerClientDirect({ admin: true });

  console.log('🔍 getTenantContext: Looking up slug:', slug);

  const { data: tenant, error: tErr } = await sb
    .from("tenants")
    .select("id, slug, name, site_hero_title, site_hero_subtitle, brand_primary, brand_secondary, brand_logo_url, status")
    .eq("slug", slug)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!tenant) {
    console.log('❌ getTenantContext: No tenant found for slug:', slug);
    return null;
  }
  
  console.log('✅ getTenantContext: Found tenant:', { id: tenant.id, slug: tenant.slug, status: tenant.status });
  
  // Get tenant profile to check publish status
  const { data: profile } = await sb
    .from("tenant_public_profile")
    .select("is_active, status")
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  console.log('📋 getTenantContext: Profile data:', profile);

  // Check if site is published - both tenant.status and profile.is_active must be true
  const isPublished = 
    tenant.status === 'active' && 
    (profile?.is_active === true || profile?.status === 'active');
  
  console.log('🚀 getTenantContext: Is published?', isPublished, {
    tenantStatus: tenant.status,
    profileIsActive: profile?.is_active,
    profileStatus: profile?.status
  });
  
  if (!isPublished) {
    console.log('❌ getTenantContext: Site not published, returning null');
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

  console.log('✅ getTenantContext: Returning tenant data with branding:', !!branding);
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
