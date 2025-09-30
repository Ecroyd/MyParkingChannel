import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase, createAdminClient } from "@/lib/supabase/server";

function parsePgDateRange(lit: string | null): [string,string] | null {
  if (!lit) return null; // e.g. "[2025-08-01,2025-08-15)"
  const m = lit.match(/^[\[\(]([^,]+),([^,\)]+)[\)\]]$/);
  if (!m) return null;
  return [m[1], m[2]];
}

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

  const url = new URL(req.url);
  const expand = url.searchParams.get("expand") === "1";
  const showAll = url.searchParams.get("all") === "1"; // include inactive

  const sel = "*";
  const { data: rules, error } = await adminSupabase
    .from("pricing_rules")
    .select(sel)
    .eq("tenant_id", tenantId)
    .order("priority", { ascending: true });
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (!expand) {
    return NextResponse.json({ data: showAll ? rules : rules.filter(r => r.is_active) });
  }

  // Expand into concrete date ranges for conflict detection
  const out = [];
  for (const r of rules as any[]) {
    const ranges: [string,string][] = [];
    if (r.date_range) {
      const pr = parsePgDateRange(r.date_range);
      if (pr) ranges.push(pr);
    } else if (r.season_id) {
      const { data: sr, error: e } = await adminSupabase
        .from("season_ranges")
        .select("range, id")
        .eq("season_id", r.season_id);
      if (e) return NextResponse.json({ error: e.message }, { status: 400 });
      for (const row of sr ?? []) {
        const pr = parsePgDateRange(row.range as string);
        if (pr) ranges.push(pr);
      }
    }
    out.push({ ...r, ranges });
  }

  const filtered = showAll ? out : out.filter((r:any)=>r.is_active);
  return NextResponse.json({ data: filtered });
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
  const ruleData = {
    ...body,
    tenant_id: tenantId,
    is_active: true // default active unless set
  };
  
  const { data, error } = await adminSupabase
    .from("pricing_rules")
    .insert(ruleData)
    .select("*")
    .single();
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}

