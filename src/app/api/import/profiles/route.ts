import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("tenant_import_profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { tenantId, name, map, timezone } = body || {};
  if (!tenantId || !name || !map) return NextResponse.json({ error: "tenantId, name, map required" }, { status: 400 });

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("tenant_import_profiles")
    .upsert({ tenant_id: tenantId, name, map, timezone }, { onConflict: "tenant_id,name" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}
