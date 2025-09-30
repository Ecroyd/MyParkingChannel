import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");

  if (!tenantId) {
    return NextResponse.json({ error: "Tenant ID is required" }, { status: 400 });
  }

  const supabase = await getServerSupabase();

  try {
    // Get user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('🔍 Contact Settings GET: Auth check:', { user: user?.id, authError });
    if (authError || !user) {
      console.log('❌ Contact Settings GET: Auth failed:', authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this tenant
    console.log('🔍 Contact Settings GET: Checking access for user:', user.id, 'tenant:', tenantId);
    
    const { data: userTenant, error: accessError } = await supabase
      .from("user_tenants")
      .select("tenant_id, role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .single();

    console.log('🔍 Contact Settings GET: Access check result:', { userTenant, accessError });

    if (accessError || !userTenant) {
      console.log('❌ Contact Settings GET: Access denied - userTenant:', userTenant, 'error:', accessError);
      
      // Fallback: Use admin client to check if user_tenants record exists
      console.log('🔍 Contact Settings GET: Trying admin client fallback...');
      const adminClient = await createAdminClient();
      const { data: adminUserTenant, error: adminAccessError } = await adminClient
        .from("user_tenants")
        .select("tenant_id, role")
        .eq("user_id", user.id)
        .eq("tenant_id", tenantId)
        .single();
      
      console.log('🔍 Contact Settings GET: Admin client check result:', { adminUserTenant, adminAccessError });
      
      if (adminAccessError || !adminUserTenant) {
        console.log('❌ Contact Settings GET: Admin client also failed - userTenant:', adminUserTenant, 'error:', adminAccessError);
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      
      console.log('✅ Contact Settings GET: Admin client found user_tenants record, proceeding...');
    }

    // Get contact settings from tenant_branding
    let branding, brandingError;
    
    const { data: brandingData, error: brandingErr } = await supabase
      .from("tenant_branding")
      .select(`
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
      .eq("tenant_id", tenantId)
      .single();
    
    branding = brandingData;
    brandingError = brandingErr;
    
    // If regular client fails, try admin client
    if (brandingError) {
      console.log('🔍 Contact Settings GET: Regular client failed, trying admin client for branding...');
      const adminClient = await createAdminClient();
      const { data: adminBranding, error: adminBrandingError } = await adminClient
        .from("tenant_branding")
        .select(`
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
        .eq("tenant_id", tenantId)
        .single();
      
      branding = adminBranding;
      brandingError = adminBrandingError;
    }

    if (brandingError) {
      console.error("Error fetching contact settings:", brandingError);
      return NextResponse.json({ error: "Failed to fetch contact settings" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      data: branding || {} 
    });

  } catch (error) {
    console.error("Contact settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");

  if (!tenantId) {
    return NextResponse.json({ error: "Tenant ID is required" }, { status: 400 });
  }

  const supabase = await getServerSupabase();

  try {
    // Get user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this tenant
    const { data: userTenant, error: accessError } = await supabase
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .single();

    if (accessError || !userTenant) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Parse request body
    const body = await req.json();
    const {
      contact_email,
      contact_phone,
      contact_address,
      contact_city,
      contact_postcode,
      contact_country,
      business_hours,
      website_url,
      social_media
    } = body;

    // Update contact settings in tenant_branding
    const { data, error: updateError } = await supabase
      .from("tenant_branding")
      .upsert({
        tenant_id: tenantId,
        contact_email,
        contact_phone,
        contact_address,
        contact_city,
        contact_postcode,
        contact_country,
        business_hours,
        website_url,
        social_media: social_media || {}
      }, { 
        onConflict: "tenant_id" 
      })
      .select()
      .single();

    if (updateError) {
      console.error("Error updating contact settings:", updateError);
      return NextResponse.json({ error: "Failed to update contact settings" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      data 
    });

  } catch (error) {
    console.error("Contact settings update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
