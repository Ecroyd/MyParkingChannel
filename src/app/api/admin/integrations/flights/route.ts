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

    const tenantId = req.nextUrl.searchParams.get("tenantId");
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

    // Check if providers exist (don't return the keys)
    const { data: providers, error } = await adminClient
      .from("tenant_flight_providers")
      .select("id, provider_name, is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    if (error) {
      console.error("Error fetching flight providers:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const hasAviationstack = providers?.some(
      (p) => p.provider_name === "aviationstack"
    );
    const hasAeroDataBox = providers?.some(
      (p) => p.provider_name === "aerodatabox"
    );

    return NextResponse.json({
      success: true,
      hasProvider: hasAviationstack || hasAeroDataBox,
      hasAviationstack: hasAviationstack || false,
      hasAeroDataBox: hasAeroDataBox || false,
      providers: providers || [],
    });
  } catch (error: any) {
    console.error("Error in flight integrations API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

