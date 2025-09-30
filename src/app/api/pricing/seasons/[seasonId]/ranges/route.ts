import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ seasonId: string }>}) {
  const { seasonId } = await params;
  
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

  const { data, error } = await adminSupabase
    .from("season_ranges")
    .select("*")
    .eq("season_id", seasonId)
    .order("created_at");
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ seasonId: string }>}) {
  const { seasonId } = await params;
  
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

  const { start, end } = await req.json(); // ISO yyyy-mm-dd
  const { data, error } = await adminSupabase
    .from("season_ranges")
    .insert({
      season_id: seasonId,
      range: `[${start},${end})`, // daterange inclusive start, exclusive end
    })
    .select("*")
    .single();
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}
