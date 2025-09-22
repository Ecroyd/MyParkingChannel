import { NextResponse } from "next/server";
import { createServerClientDirect } from "@/lib/supabase/server-direct";

export const dynamic = "force-dynamic";

/** Body: { tenantId?: string, slug?: string, name?: string } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const { tenantId, slug, name } = body || {};
  if (!tenantId && !slug) {
    return NextResponse.json({ ok: false, error: "Provide tenantId or slug" }, { status: 400 });
  }

  const sb = createServerClientDirect({ admin: true });

  // Resolve or create tenant by slug
  let tId = tenantId as string | undefined;

  if (!tId && slug) {
    const { data: t } = await sb.from("tenants").select("id").eq("slug", slug).maybeSingle();
    if (t?.id) tId = t.id;
    if (!tId) {
      const ins = await sb.from("tenants").insert({ slug, name: name || slug }).select("id").single();
      if (ins.error) return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 });
      tId = ins.data.id;
    }
  }

  // Upsert basic records (idempotent)
  await sb.from("sites").upsert({ tenant_id: tId!, slug: slug || "", status: "published", template: "default" }, { onConflict: "tenant_id" });
  await sb.from("tenant_pricing").upsert({ tenant_id: tId!, daily_rate: 7.0 }, { onConflict: "tenant_id" });
  await sb.from("tenant_branding").upsert(
    { tenant_id: tId!, app_name: name || slug || "Parking", short_name: "Parking", theme_color: "#0ea5e9", background_color: "#ffffff" },
    { onConflict: "tenant_id" }
  );

  // Optional: starter pages (path-based sites)
  const { data: siteRow } = await sb.from("sites").select("id").eq("tenant_id", tId!).maybeSingle();
  if (siteRow?.id) {
    const exists = async (path: string) =>
      (await sb.from("site_pages").select("id").eq("site_id", siteRow.id).eq("path", path).maybeSingle()).data;

    if (!(await exists("/"))) await sb.from("site_pages").insert({ site_id: siteRow.id, path: "/", title: "Home", content_md: "" });
    if (!(await exists("/book"))) await sb.from("site_pages").insert({ site_id: siteRow.id, path: "/book", title: "Book", content_md: "" });
  }

  const link = `${process.env.NEXT_PUBLIC_SITES_BASE_DOMAIN || "http://localhost:3002"}/t/${slug || ""}`;
  return NextResponse.json({ ok: true, tenantId: tId, previewUrl: link });
}
