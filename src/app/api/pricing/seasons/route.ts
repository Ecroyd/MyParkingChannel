import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
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

  const { data, error } = await adminSupabase
    .from("seasons")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name");
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
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
  
  // Add tenant_id to the body before inserting
  const seasonData = {
    ...body,
    tenant_id: tenantId
  };
  
  const { data, error } = await adminSupabase
    .from("seasons")
    .insert(seasonData)
    .select("*")
    .single();
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}

