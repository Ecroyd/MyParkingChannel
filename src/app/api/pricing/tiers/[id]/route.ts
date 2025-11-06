import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, createAdminClient } from "@/lib/supabase/server";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }>}) {
  const { id } = await params;
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

  const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
  const tenantId = userTenant.tenant_id;

  const body = await req.json();

  // Check if price_tiers table exists
  const { data: testData, error: testError } = await adminSupabase
    .from("price_tiers")
    .select("id")
    .limit(1);
  
  if (testError && testError.code === 'PGRST116') {
    // Table doesn't exist, update tenant_pricing instead
    if (id === "default") {
      const { data, error } = await adminSupabase
        .from("tenant_pricing")
        .upsert({
          tenant_id: tenantId,
          daily_rate: body.value || 7.0,
          minute_rate: (body.value || 7.0) / (24 * 60),
          billing_type: 'day',
          currency: body.currency || 'GBP'
        }, { onConflict: 'tenant_id' })
        .select("*")
        .single();
        
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      
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
      });
    } else {
      return NextResponse.json({ error: "Cannot update non-default tier when price_tiers table doesn't exist" }, { status: 400 });
    }
  }
  
  // price_tiers table exists, use it
  const { data, error } = await adminSupabase
    .from("price_tiers")
    .update({ ...body, tenant_id: tenantId })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();
    
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  return NextResponse.json({ success: true, data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }>}) {
  const { id } = await params;
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

  const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
  const tenantId = userTenant.tenant_id;

  // Check if price_tiers table exists
  const { data: testData, error: testError } = await adminSupabase
    .from("price_tiers")
    .select("id")
    .limit(1);
  
  if (testError && testError.code === 'PGRST116') {
    // Table doesn't exist, cannot delete default tier
    if (id === "default") {
      return NextResponse.json({ error: "Cannot delete default tier - it's managed by tenant_pricing" }, { status: 400 });
    } else {
      return NextResponse.json({ error: "Cannot delete tier when price_tiers table doesn't exist" }, { status: 400 });
    }
  }
  
  // price_tiers table exists, delete from it
  const { error } = await adminSupabase
    .from("price_tiers")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
    
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  return NextResponse.json({ success: true });
}
