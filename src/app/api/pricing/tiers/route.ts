import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant ID is required" }, { status: 400 });
  }

  const supabase = await getServerSupabase();
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

  // Get pricing for the tenant
  const { data, error } = await supabase
    .from("tenant_pricing")
    .select("daily_rate")
    .eq("tenant_id", tenantId)
    .single();

  if (error) {
    // If no pricing found, return default
    return NextResponse.json({ 
      success: true, 
      data: [{ value: 7.0, label: "Daily Rate", type: "flat" }] 
    });
  }

  return NextResponse.json({ 
    success: true, 
    data: [{ value: data.daily_rate || 7.0, label: "Daily Rate", type: "flat" }] 
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

