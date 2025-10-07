import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { tenantId, runId } = await req.json();
  if (!tenantId || !runId) return NextResponse.json({ error: "tenantId and runId required" }, { status: 400 });

  const supabase = await getServerSupabase();
  const { error: delStagingErr } = await supabase
    .from("booking_import_staging")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("run_id", runId);
  if (delStagingErr) return NextResponse.json({ error: delStagingErr.message }, { status: 400 });

  const { error: delRunErr } = await supabase
    .from("import_runs")
    .delete()
    .eq("id", runId);
  if (delRunErr) return NextResponse.json({ error: delRunErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
