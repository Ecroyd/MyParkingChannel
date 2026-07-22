import { NextResponse } from "next/server";
import { requireSeoAdminContext } from "@/lib/seo/admin-context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { invalidateSiteSeoCaches } from "@/lib/seo/cache";

export async function PUT(req: Request) {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { ctx } = auth;
  const body = await req.json();

  // Never accept tenant_id / site_id from client for ownership
  const {
    tenant_id: _t,
    site_id: _s,
    id: _id,
    created_at: _c,
    ...safe
  } = body ?? {};

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("site_seo_settings")
    .upsert(
      {
        ...safe,
        site_id: ctx.siteId,
        tenant_id: ctx.tenantId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_id" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: domains } = await admin
    .from("tenant_domains")
    .select("domain")
    .eq("tenant_id", ctx.tenantId);

  invalidateSiteSeoCaches({
    siteId: ctx.siteId,
    tenantId: ctx.tenantId,
    hostnames: (domains ?? []).map((d) => d.domain),
  });

  return NextResponse.json({ success: true, data });
}
