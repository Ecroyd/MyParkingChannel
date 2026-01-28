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

  // Fetch branding (unchanged logic)
  const { data: brandingData, error: brandingError } = await sb
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

  if (brandingError) {
    console.error("[GET_SITE_CONTEXT] Error fetching branding:", brandingError);
  }

  const branding = brandingData || null;

  // --- Updated site lookup: slug first, then tenant_id fallback ---
  let site: any = null;

  // 1) try slug if we have it (subdomain and /sites/[slug] routes)
  if (slug) {
    const { data, error } = await sb
      .from("sites")
      .select("id, tenant_id, slug, booking_modal_style")
      .eq("slug", slug)
      .maybeSingle();

    console.log("[GET_SITE_CONTEXT] by slug", { slug, data, error });

    if (error) {
      // If there's an error about column not existing, default to null (card style)
      if ((error as any).code === "42703") {
        console.log("[GET_SITE_CONTEXT] booking_modal_style column does not exist yet (by slug lookup)");
      } else {
        console.error("[GET_SITE_CONTEXT] Error fetching site by slug:", error);
      }
    } else {
      site = data ?? null;
    }
  }

  // 2) fallback: if slug lookup failed, load site by tenant_id
  if (!site) {
    const { data, error } = await sb
      .from("sites")
      .select("id, tenant_id, slug, booking_modal_style")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    console.log("[GET_SITE_CONTEXT] by tenantId fallback", { tenantId: tenant.id, data, error });

    if (error) {
      if ((error as any).code === "42703") {
        console.log("[GET_SITE_CONTEXT] booking_modal_style column does not exist yet (by tenantId fallback)");
      } else {
        console.error("[GET_SITE_CONTEXT] Error fetching site by tenant_id:", error);
      }
    } else {
      site = data ?? null;
    }
  }

  console.log("[GET_SITE_CONTEXT] final site selection", { slug, tenantId: tenant.id, site });

  return { 
    tenant, 
    branding,
    site: site || null
  };
}

// Back-compat for older /sites/[slug] pages:
export async function getSiteContext(
  slug: string,
  _opts: { preview?: boolean } = {}
) {
  // For now, reuse getTenantContext (which now has the slug → tenant_id → sites logic)
  return getTenantContext(slug);
}
