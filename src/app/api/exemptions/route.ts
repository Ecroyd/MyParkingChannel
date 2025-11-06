import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get tenant ID from query params
    const tenantId = req.nextUrl.searchParams.get("tenantId");
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);

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

    // Fetch from exemptions_live view
    const { data: liveData, error: liveError } = await adminClient
      .from("exemptions_live")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("breach_point", { ascending: false })
      .limit(limit * 2); // Get more to account for filtering

    if (liveError) {
      console.error("Error fetching exemptions:", liveError);
      return NextResponse.json({ error: liveError.message }, { status: 500 });
    }

    // Fetch already resolved exemptions to filter them out
    const { data: resolvedData } = await adminClient
      .from("exemptions")
      .select("tenant_id, exemption_type, vehicle_reg, booking_id, source_event_id, detected_at")
      .eq("tenant_id", tenantId)
      .not("resolved_at", "is", null);

    // Create a set of resolved exemption keys for quick lookup
    // Use detected_at from exemptions table, which should match breach_point from view
    const resolvedKeys = new Set(
      (resolvedData || []).map((r) => {
        // Normalize the timestamp to minute precision for matching
        const detectedAt = r.detected_at ? new Date(r.detected_at).toISOString().slice(0, 16) : 'none';
        const key = `${r.tenant_id}-${r.exemption_type}-${(r.vehicle_reg || '').toUpperCase()}-${r.booking_id || 'none'}-${r.source_event_id || 'none'}-${detectedAt}`;
        return key;
      })
    );

    // Filter out resolved exemptions
    const unresolved = (liveData || []).filter((item) => {
      // Normalize the timestamp to minute precision for matching
      const breachPoint = item.breach_point ? new Date(item.breach_point).toISOString().slice(0, 16) : 'none';
      const key = `${item.tenant_id}-${item.exemption_type}-${(item.vehicle_reg || '').toUpperCase()}-${item.booking_id || 'none'}-${item.source_event_id || 'none'}-${breachPoint}`;
      return !resolvedKeys.has(key);
    }).slice(0, limit); // Limit after filtering

    return NextResponse.json({ items: unresolved });
  } catch (error: any) {
    console.error("Error in exemptions API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

