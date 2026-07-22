import { NextResponse } from "next/server";
import { requireSeoAdminContext } from "@/lib/seo/admin-context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { invalidateSiteSeoCaches } from "@/lib/seo/cache";

/** Back-compat profile GET/POST — prefer /profile and /bundle for new UI. */
export async function GET() {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("tenant_public_profile")
    .select("*")
    .eq("tenant_id", auth.ctx.tenantId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to fetch profile data" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: profile || {
      tenant_id: auth.ctx.tenantId,
      features: [],
      faq: [],
      hours: [],
    },
  });
}

export async function POST(req: Request) {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const data = await req.json();
  const { tenant_id: _ignored, ...safe } = data ?? {};

  const admin = createAdminClient();
  const { data: result, error } = await admin
    .from("tenant_public_profile")
    .upsert({ ...safe, tenant_id: auth.ctx.tenantId })
    .select();

  if (error) {
    return NextResponse.json({ error: "Failed to update profile data" }, { status: 500 });
  }

  invalidateSiteSeoCaches({
    siteId: auth.ctx.siteId,
    tenantId: auth.ctx.tenantId,
  });

  return NextResponse.json({ success: true, data: result });
}
