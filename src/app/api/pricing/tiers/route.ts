import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's tenants (following the same pattern as other admin pages)
  const { data: userTenants, error: tenantError } = await supabase
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
    return NextResponse.json({ error: "Error loading tenant data" }, { status: 400 });
  }

  if (!userTenants || userTenants.length === 0) {
    return NextResponse.json({ error: "No tenant access found" }, { status: 404 });
  }

  // Find the default tenant or use the first one
  const userTenant = userTenants.find(ut => ut.is_default) || userTenants[0];
  const tenant = userTenant?.tenants;

  if (!tenant) {
    return NextResponse.json({ error: "No tenant found" }, { status: 404 });
  }

  // Get pricing data from tenant_pricing table
  const { data: pricing, error: pricingError } = await supabase
    .from("tenant_pricing")
    .select("*")
    .eq("tenant_id", (tenant as any).id)
    .single();

  if (pricingError) {
    console.log('Pricing data not found or error:', pricingError);
    // Return default pricing structure
    return NextResponse.json({ 
      success: true, 
      data: [
        { id: "default", code: "standard", label: "Standard Rate", type: "flat", value: 7.0, color: "#3b82f6", sort_order: 10, is_active: true }
      ] 
    });
  }

  // Transform tenant_pricing data to match expected format
  const tiers = [
    {
      id: pricing.id || "default",
      code: "standard",
      label: "Standard Rate",
      type: "flat",
      value: pricing.daily_rate || 7.0,
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

export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { data, error } = await supabase.from("price_tiers").insert(body).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}

