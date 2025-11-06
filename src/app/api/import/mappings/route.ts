import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const supabase = await getServerSupabase();
  
  // Fetch all mappings using pagination to avoid the 1000 row limit
  let allMappings: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("booking_import_mappings")
      .select("id, name, mapping, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    
    if (data && data.length > 0) {
      allMappings = allMappings.concat(data);
      hasMore = data.length === pageSize;
      page++;
    } else {
      hasMore = false;
    }
  }

  return NextResponse.json({ mappings: allMappings });
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
