import { createServerClientDirect } from "@/lib/supabase/server-direct";

export async function getTenantContext(slug: string) {
  console.log("[GET_SITE_CONTEXT] inputs", { slugParam: slug });
  
  if (!slug) {
    console.log("[GET_SITE_CONTEXT] ERROR: slug is empty or undefined");
    return null;
  }
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

  const [brandingResult, siteResult] = await Promise.allSettled([
    sb
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
      .maybeSingle(),
    sb
      .from("sites")
      .select("id, tenant_id, slug, booking_modal_style")
      .eq("tenant_id", tenant.id)
      .maybeSingle()
  ]);

  const branding = brandingResult.status === 'fulfilled' && !brandingResult.value.error 
    ? (brandingResult.value.data || null) 
    : null;
  
  // Handle site result - check if it succeeded and if column exists
  let site = null;
  if (siteResult.status === 'fulfilled') {
    const result = siteResult.value;
    // If there's an error about column not existing, default to null (card style)
    if (result.error && result.error.code === '42703') {
      // Column doesn't exist yet - that's okay, default to card
      console.log('[GET_SITE_CONTEXT] booking_modal_style column does not exist yet');
      site = null;
    } else if (result.error) {
      // Other error - log it
      console.error('[GET_SITE_CONTEXT] Error fetching site:', result.error);
      site = null;
    } else {
      site = result.data || null;
      console.log('[GET_SITE_CONTEXT] slug', slug);
      console.log('[GET_SITE_CONTEXT] site', site);
      console.log('[GET_SITE_CONTEXT] error', result.error);
    }
  } else {
    // Promise was rejected
    console.error('[GET_SITE_CONTEXT] Site query promise rejected:', siteResult);
  }

  return { 
    tenant, 
    branding: branding || null,
    site: site || null
  };
}

// Back-compat for older /sites/[slug] pages:
export async function getSiteContext(
  slug: string,
  _opts: { preview?: boolean } = {}
) {
  // same behaviour as getTenantContext for our MVP
  return getTenantContext(slug);
}
