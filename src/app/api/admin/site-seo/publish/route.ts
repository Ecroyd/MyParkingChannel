import { NextResponse } from "next/server";
import { requireSeoAdminContext } from "@/lib/seo/admin-context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { invalidateSiteSeoCaches } from "@/lib/seo/cache";

/** Mark SEO settings published and invalidate caches. Does not change DNS. */
export async function POST() {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { ctx } = auth;
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("site_seo_settings")
    .upsert(
      {
        site_id: ctx.siteId,
        tenant_id: ctx.tenantId,
        last_published_at: now,
        updated_at: now,
      },
      { onConflict: "site_id" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Publish any draft pages that are marked ready? — only bump settings timestamp
  const { data: domains } = await admin
    .from("tenant_domains")
    .select("domain")
    .eq("tenant_id", ctx.tenantId);

  invalidateSiteSeoCaches({
    siteId: ctx.siteId,
    tenantId: ctx.tenantId,
    hostnames: (domains ?? []).map((d) => d.domain),
  });

  return NextResponse.json({ success: true, lastPublishedAt: now, data });
}
