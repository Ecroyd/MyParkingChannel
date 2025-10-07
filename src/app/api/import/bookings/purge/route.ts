import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { tenantId } = await req.json();
  if (!tenantId) return NextResponse.json({ error: "tenantId required" }, { status: 400 });

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("booking_import_staging")
    .delete()
    .eq("tenant_id", tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
