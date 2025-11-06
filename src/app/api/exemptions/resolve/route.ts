import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId, exemptionType, bookingId, sourceEventId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    // Verify user has access to this tenant
    const { data: userTenant } = await adminClient
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!userTenant) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Create a resolved row in 'exemptions' table
    const { error } = await adminClient.from("exemptions").insert({
      tenant_id: tenantId,
      exemption_type: exemptionType || "OVERSTAY",
      booking_id: bookingId || null,
      source_event_id: sourceEventId || null,
      detected_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      resolution_note: "Manually resolved",
      resolution_by: user.id,
    });

    if (error) {
      console.error("Error resolving exemption:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in resolve exemption API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

