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
    const { data, error } = await adminClient
      .from("exemptions_live")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("breach_point", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching exemptions:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data || [] });
  } catch (error: any) {
    console.error("Error in exemptions API:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

