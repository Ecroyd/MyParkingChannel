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
    const { exemptions, tenantId, exemptionType, bookingId, sourceEventId } = body;

    // Support both single and bulk resolve
    const exemptionsToResolve = exemptions || [
      { tenantId, exemptionType, bookingId, sourceEventId },
    ];

    if (!exemptionsToResolve || exemptionsToResolve.length === 0) {
      return NextResponse.json({ error: "No exemptions provided" }, { status: 400 });
    }

    // Get tenant ID from first exemption
    const firstTenantId = exemptionsToResolve[0].tenantId;
    if (!firstTenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    // Verify user has access to this tenant
    const { data: userTenant } = await adminClient
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", user.id)
      .eq("tenant_id", firstTenantId)
      .maybeSingle();

    if (!userTenant) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Resolve each exemption
    const resolvedAt = new Date().toISOString();
    const inserts = exemptionsToResolve.map((ex: any) => ({
      tenant_id: ex.tenantId,
      exemption_type: ex.exemptionType || "OVERSTAY",
      vehicle_reg: ex.vehicleReg || null,
      booking_id: ex.bookingId || null,
      source_event_id: ex.sourceEventId || null,
      detected_at: ex.breachPoint || new Date().toISOString(),
      resolved_at: resolvedAt,
      resolution_note: "Manually resolved",
      resolution_by: user.id,
      meta: {
        resolved_bulk: exemptionsToResolve.length > 1,
      },
    }));

    // Update bookings for OVERSTAY and NO_SHOW exemptions
    const bookingUpdatePromises: Promise<any>[] = [];
    for (const ex of exemptionsToResolve) {
      if (ex.exemptionType === "OVERSTAY" && ex.bookingId) {
        // Mark booking as checked out
        const query = adminClient
          .from("bookings")
          .update({ checked_out_at: resolvedAt })
          .eq("id", ex.bookingId);
        // Convert PostgrestFilterBuilder to Promise
        bookingUpdatePromises.push(
          new Promise((resolve, reject) => {
            query.then(resolve).catch(reject);
          })
        );
      } else if (ex.exemptionType === "NO_SHOW" && ex.bookingId) {
        // Mark booking as checked in (they showed up late)
        const query = adminClient
          .from("bookings")
          .update({ checked_in_at: resolvedAt })
          .eq("id", ex.bookingId);
        // Convert PostgrestFilterBuilder to Promise
        bookingUpdatePromises.push(
          new Promise((resolve, reject) => {
            query.then(resolve).catch(reject);
          })
        );
      }
    }

    // Execute booking updates and exemption inserts in parallel
    const [bookingResults, exemptionResult] = await Promise.all([
      bookingUpdatePromises.length > 0 ? Promise.all(bookingUpdatePromises) : Promise.resolve([]),
      adminClient.from("exemptions").insert(inserts),
    ]);

    const { error } = exemptionResult;

    if (error) {
      console.error("Error resolving exemptions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      resolved: inserts.length,
    });
  } catch (error: any) {
    console.error("Error in resolve exemption API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

