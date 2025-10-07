import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("booking_import_mappings")
    .select("id, name, mapping, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ mappings: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { tenantId, name, map } = body || {};
  if (!tenantId || !name || !map) {
    return NextResponse.json({ error: "tenantId, name, and map are required" }, { status: 400 });
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("booking_import_mappings")
    .insert({ 
      tenant_id: tenantId, 
      name, 
      mapping: map,  // Note: column is 'mapping', not 'map'
      header_signature: ''  // Required field with default
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
