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

    // Fetch tenant_settings (only anpr_provider per SQL schema)
    const { data: settingsData, error: settingsError } = await adminClient
      .from("tenant_settings")
      .select("anpr_provider")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (settingsError) {
      console.error("Error fetching tenant_settings:", settingsError);
      return NextResponse.json({ error: settingsError.message }, { status: 500 });
    }

    // Fetch API base URL from tenant_secrets
    let baseUrl = null;
    try {
      // Try column-based approach first
      const { data: secretsData } = await adminClient
        .from("tenant_secrets")
        .select("anpr_api_base_url")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (secretsData?.anpr_api_base_url) {
        baseUrl = secretsData.anpr_api_base_url;
      } else {
        // Try key-value approach
        const { data: kvData } = await adminClient
          .from("tenant_secrets")
          .select("value")
          .eq("tenant_id", tenantId)
          .eq("key", "anpr_api_base_url")
          .maybeSingle();

        if (kvData?.value) {
          baseUrl = kvData.value;
        }
      }
    } catch (err) {
      // tenant_secrets might not have this data, that's okay
      console.warn("Could not fetch base URL from tenant_secrets:", err);
    }

    // Construct webhook URL
    const webhookUrl = `${req.nextUrl.origin}/api/anpr/webhook?tenantId=${tenantId}`;

    return NextResponse.json({
      success: true,
      data: {
        anpr_provider: settingsData?.anpr_provider || null,
        anpr_api_base_url: baseUrl,
        webhook_url: webhookUrl,
      },
    });
  } catch (error: any) {
    console.error("Error in integrations settings API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

