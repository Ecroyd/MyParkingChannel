import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  console.log('GET /api/pricing/tiers called');
  const supabase = await getServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    console.log('Auth error:', authError);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log('User authenticated:', user.id);

  // Get user's tenants using admin client to bypass RLS
  const adminSupabase = await createAdminClient();
  const { data: userTenants, error: tenantError } = await adminSupabase
    .from('user_tenants')
    .select(`
      tenant_id,
      role,
      is_default,
      tenants (
        id,
        name,
        slug,
        timezone
      )
    `)
    .eq('user_id', user.id);

  if (tenantError) {
    console.log('Tenant error:', tenantError);
    return NextResponse.json({ error: "Error loading tenant data" }, { status: 400 });
  }

  console.log('User tenants found:', userTenants?.length || 0);

  if (!userTenants || userTenants.length === 0) {
    console.log('No tenant access found');
    return NextResponse.json({ error: "No tenant access found" }, { status: 404 });
  }

  // Find the default tenant or use the first one
  const userTenant = userTenants.find(ut => ut.is_default) || userTenants[0];
  const tenant = userTenant?.tenants;

  console.log('Selected tenant:', tenant);

  if (!tenant) {
    console.log('No tenant found in userTenant');
    return NextResponse.json({ error: "No tenant found" }, { status: 404 });
  }

  // Try to get pricing tiers from price_tiers table first
  const { data: tiersData, error: tiersError } = await adminSupabase
    .from("price_tiers")
    .select("*")
    .eq("tenant_id", (tenant as any).id)
    .order("sort_order", { ascending: true });

  if (tiersError && tiersError.code === 'PGRST116') {
    // price_tiers table doesn't exist, get from tenant_pricing
    console.log('price_tiers table does not exist, using tenant_pricing');
    
    const { data: pricingData, error: pricingError } = await adminSupabase
      .from("tenant_pricing")
      .select("*")
      .eq("tenant_id", (tenant as any).id)
      .maybeSingle();

    if (pricingError) {
      console.log('Tenant pricing error:', pricingError);
      return NextResponse.json({ error: "Failed to fetch pricing data" }, { status: 500 });
    }

    // Transform tenant_pricing data to match expected format
    const tiers = [
      {
        id: "default",
        code: "standard",
        label: "Standard Rate",
        type: "flat",
        value: pricingData?.daily_rate || 7.0,
        color: "#3b82f6",
        sort_order: 10,
        is_active: true
      }
    ];

    return NextResponse.json({ 
      success: true, 
      data: tiers 
    });
  }

  if (tiersError) {
    console.log('Price tiers error:', tiersError);
    return NextResponse.json({ error: "Failed to fetch price tiers" }, { status: 500 });
  }

  console.log('Price tiers found:', tiersData?.length || 0, 'records');

  // If no tiers exist, return default structure
  if (!tiersData || tiersData.length === 0) {
    console.log('No price tiers found, returning default');
    return NextResponse.json({ 
      success: true, 
      data: [
        { id: "default", code: "standard", label: "Standard Rate", type: "flat", value: 7.0, color: "#3b82f6", sort_order: 10, is_active: true }
      ] 
    });
  }

  return NextResponse.json({ 
    success: true, 
    data: tiersData 
  });
}

export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's tenant
  const adminSupabase = await createAdminClient();
  const { data: userTenants, error: tenantError } = await adminSupabase
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (tenantError || !userTenants || userTenants.length === 0) {
    return NextResponse.json({ error: "No tenant access found" }, { status: 404 });
  }

  const userTenant = userTenants.find(ut => ut.is_default) || userTenants[0];
  const tenantId = userTenant.tenant_id;

  const body = await req.json();
  
  // Check if price_tiers table exists by trying to query it first
  const { data: testData, error: testError } = await adminSupabase
    .from("price_tiers")
    .select("id")
    .limit(1);
  
  if (testError && testError.code === 'PGRST116') {
    // Table doesn't exist, use tenant_pricing table instead
    console.log('price_tiers table does not exist, using tenant_pricing');
    
    const { data, error } = await adminSupabase
      .from("tenant_pricing")
      .upsert({
        tenant_id: tenantId,
        daily_rate: body.value || 7.0,
        currency: 'GBP'
      }, { onConflict: 'tenant_id' })
      .select("*")
      .single();
      
    if (error) {
      console.error('Tenant pricing update error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    
    // Return in the expected format
    return NextResponse.json({ 
      success: true, 
      data: {
        id: "default",
        code: body.code || "standard",
        label: body.label || "Standard Rate",
        type: body.type || "flat",
        value: body.value || 7.0,
        color: body.color || "#3b82f6",
        sort_order: body.sort_order || 10,
        is_active: body.is_active !== false
      }
    }, { status: 201 });
  }
  
  // price_tiers table exists, use it
  const tierData = {
    ...body,
    tenant_id: tenantId
  };
  
  console.log('Inserting price tier:', tierData);
  
  const { data, error } = await adminSupabase
    .from("price_tiers")
    .insert(tierData)
    .select("*")
    .single();
    
  if (error) {
    console.error('Price tier insert error:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  return NextResponse.json({ success: true, data }, { status: 201 });
}

