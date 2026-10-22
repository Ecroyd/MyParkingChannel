import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireTenantMemberApi } from "@/lib/auth/apiGuards";
import {
  buildAnprWebhookUrl,
  generateWebhookToken,
  hashWebhookToken,
  loadWebhookTokenHash,
  saveWebhookTokenHash,
} from "@/lib/anpr/webhookToken";

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

    // Whether the tenant has opted in to a webhook token (raw token is never stored/returned here)
    let webhookTokenConfigured = false;
    try {
      webhookTokenConfigured = Boolean(await loadWebhookTokenHash(tenantId));
    } catch (err) {
      console.warn("Could not read ANPR webhook token status:", err);
    }

    return NextResponse.json({
      success: true,
      data: {
        anpr_provider: settingsData?.anpr_provider || null,
        anpr_api_base_url: baseUrl,
        webhook_url: webhookUrl,
        webhook_token_configured: webhookTokenConfigured,
      },
    });
  } catch (error: any) {
    console.error("Error in integrations settings API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}


/**
 * POST /api/admin/settings/integrations?tenantId=…  body: { action?: "rotate_webhook_token" | "clear_webhook_token" }
 * Owner/admin only. "rotate_webhook_token" (default) generates a new ANPR webhook token, stores its
 * sha256 hash in tenant_secrets (scope 'anpr', key 'anpr_webhook_token_hash') and returns the raw
 * token + full webhook URL ONCE. From then on /api/anpr/webhook and /api/anpr/events require it for
 * this tenant. "clear_webhook_token" removes it (back to unauthenticated, deprecated mode).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const tenantId: string | null = req.nextUrl.searchParams.get("tenantId") || body?.tenantId || null;

    const guard = await requireTenantMemberApi(tenantId, ["owner", "admin"]);
    if (guard.response) return guard.response;
    const tid = tenantId as string;

    const action = body?.action ?? "rotate_webhook_token";

    if (action === "clear_webhook_token") {
      await saveWebhookTokenHash(tid, null);
      return NextResponse.json({
        success: true,
        data: { webhook_url: buildAnprWebhookUrl(req.nextUrl.origin, tid), webhook_token_configured: false },
      });
    }

    if (action !== "rotate_webhook_token") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const token = generateWebhookToken();
    await saveWebhookTokenHash(tid, hashWebhookToken(token));

    return NextResponse.json({
      success: true,
      data: {
        webhook_token: token,
        webhook_url: buildAnprWebhookUrl(req.nextUrl.origin, tid, token),
        webhook_token_configured: true,
      },
    });
  } catch (error: any) {
    console.error("Error rotating ANPR webhook token:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
