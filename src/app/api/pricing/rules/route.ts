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

  const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
  const tenantId = userTenant.tenant_id;

  const url = new URL(req.url);
  const expand = url.searchParams.get("expand") === "1";
  const showAll = url.searchParams.get("all") === "1"; // include inactive

  const sel = "*";
  // Try pricing_rules first, fallback to booking_rules if it doesn't exist
  let { data: rules, error } = await adminSupabase
    .from("pricing_rules")
    .select(sel)
    .eq("tenant_id", tenantId)
    .order("priority", { ascending: true });
    
  if (error && error.code === 'PGRST116') {
    // pricing_rules table doesn't exist, try booking_rules
    console.log('pricing_rules table does not exist, trying booking_rules');
    const result = await adminSupabase
      .from("booking_rules")
      .select(sel)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    rules = result.data;
    error = result.error;
  }
    
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (!expand) {
    // Filter by is_active if the column exists, otherwise show all
    const filteredRules = rules?.filter((r: any) => showAll || r.is_active !== false) || [];
    return NextResponse.json({ data: filteredRules });
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

  const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
  const tenantId = userTenant.tenant_id;

  const body = await req.json();
  
  // Validate required fields
  if (!body.tier_id) {
    return NextResponse.json({ error: "tier_id is required" }, { status: 400 });
  }
  
  // Add tenant_id to the body before inserting
  const ruleData = {
    ...body,
    tenant_id: tenantId,
    is_active: body.is_active !== false // default active unless explicitly set to false
  };
  
  // Try pricing_rules first, fallback to booking_rules if it doesn't exist
  console.log('Inserting pricing rule:', ruleData);
  
  let { data, error } = await adminSupabase
    .from("pricing_rules")
    .insert(ruleData)
    .select("*")
    .single();
    
  if (error) {
    console.error('Pricing rules insert error:', error);
    // If it's a table not found error, try booking_rules
    if (error.code === 'PGRST116') {
    // pricing_rules table doesn't exist, try booking_rules
    console.log('pricing_rules table does not exist, trying booking_rules');
    
    // Transform data for booking_rules table structure
    const bookingRuleData = {
      tenant_id: tenantId,
      type: body.type || 'both',
      rule_kind: body.rule_kind || 'surcharge',
      applies_to_days: body.weekdays || null,
      specific_date: body.specific_date || null,
      surcharge_amount: body.surcharge_amount || null,
      notes: body.note || null
    };
    
      const result = await adminSupabase
        .from("booking_rules")
        .insert(bookingRuleData)
        .select("*")
        .single();
      data = result.data;
      error = result.error;
    } else {
      // Other error, return it directly with more details
      console.error('Pricing rules insert failed:', error);
      return NextResponse.json({ 
        error: error.message, 
        details: error,
        ruleData: ruleData 
      }, { status: 400 });
    }
  }
    
  if (error) return NextResponse.json({ error: error.message, details: error }, { status: 400 });
  return NextResponse.json({ data }, { status: 201 });
}

