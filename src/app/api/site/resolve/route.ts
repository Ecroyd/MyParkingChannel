// src/app/api/site/resolve/route.ts
import { NextResponse } from "next/server";
import { getSiteContext } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug") || "";
  const preview = searchParams.get("preview") === "1";

  try {
    const ctx = await getSiteContext(slug, { preview });
    return NextResponse.json({
      ok: true,
      slug,
      site: null, // No site property in getSiteContext
      tenant: ctx?.tenant ? { id: ctx.tenant.id, slug: ctx.tenant.slug, name: ctx.tenant.name } : null,
      branding: ctx?.branding ?? null,
      pagesCount: 0, // No pages property in getSiteContext
      visible: !!ctx,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
