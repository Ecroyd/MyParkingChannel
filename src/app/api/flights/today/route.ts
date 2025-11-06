import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const tz = searchParams.get("tz") || "Europe/London";

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    // Call the RPC function to get flights with counts
    const supa = supabaseAdmin();
    const { data, error } = await supa.rpc(
      "get_flights_today_with_counts",
      {
        p_tenant_id: tenantId,
        p_tz: tz,
      }
    );

    if (error) {
      console.error("Error calling RPC:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (error: any) {
    console.error("Error in flights today API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

