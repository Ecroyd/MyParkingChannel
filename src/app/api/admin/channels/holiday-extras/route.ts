import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getHolidayExtrasConfig } from "@/lib/tenantSecrets/holidayExtras";

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

    // Fetch Holiday Extras config (this will decrypt sensitive fields)
    const config = await getHolidayExtrasConfig(tenantId);

    if (!config) {
      return NextResponse.json({
        success: true,
        data: {
          abtaNumber: "",
          initials: "",
          environment: "sandbox",
          system: "ABC",
          lang: "en",
        },
      });
    }

    // Return non-sensitive fields only (apiKey and password are not returned for security)
    return NextResponse.json({
      success: true,
      data: {
        abtaNumber: config.abtaNumber,
        initials: config.initials || "",
        environment: config.environment,
        system: config.system,
        lang: config.lang,
      },
    });
  } catch (error: any) {
    console.error("Error in Holiday Extras settings API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

