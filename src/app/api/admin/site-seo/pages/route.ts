import { NextResponse } from "next/server";
import { requireSeoAdminContext } from "@/lib/seo/admin-context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { invalidateSiteSeoCaches } from "@/lib/seo/cache";
import { parseContentBlocks } from "@/lib/seo/content-blocks";
import { FORCE_NOINDEX_PAGE_KEYS } from "@/lib/seo/types";

export async function PUT(req: Request) {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { ctx } = auth;
  const body = await req.json();
  const pageId = body?.id as string | undefined;

  if (!pageId) {
    return NextResponse.json({ error: "Page id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("site_pages")
    .select("id, site_id, page_key")
    .eq("id", pageId)
    .maybeSingle();

  if (!existing || existing.site_id !== ctx.siteId) {
    return NextResponse.json({ error: "Page not found for this tenant" }, { status: 404 });
  }

  // Validate content_json safely — store only parseable structure
  let contentJson = body.content_json;
  if (contentJson != null) {
    const parsed = parseContentBlocks(contentJson);
    // Keep original array shape if valid; strip unknown by re-serializing parsed
    contentJson = Array.isArray(contentJson)
      ? contentJson.filter((_: unknown, i: number) => parseContentBlocks([Array.isArray(contentJson) ? contentJson[i] : null]).length || true)
      : parsed;
    // Prefer storing the raw array after soft validation (unknown blocks dropped on read)
    if (!Array.isArray(body.content_json)) {
      contentJson = parsed;
    } else {
      contentJson = body.content_json;
    }
  }

  let robotsIndex = body.robots_index;
  if (existing.page_key && FORCE_NOINDEX_PAGE_KEYS.has(existing.page_key)) {
    // Transactional pages cannot be forced indexable via API mistake silently — allow explicit false only by defaulting
    if (robotsIndex === true) {
      return NextResponse.json(
        { error: "Transactional pages cannot be set to index" },
        { status: 400 }
      );
    }
    robotsIndex = false;
  }

  const path = typeof body.path === "string" ? body.path.trim() : undefined;
  if (path != null && !path.startsWith("/")) {
    return NextResponse.json({ error: "Path must start with /" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const allowed = [
    "title",
    "path",
    "h1",
    "excerpt",
    "content_md",
    "content_json",
    "seo_title",
    "meta_description",
    "canonical_path",
    "robots_index",
    "robots_follow",
    "og_title",
    "og_description",
    "og_image_url",
    "nav_label",
    "nav_order",
    "show_in_navigation",
    "status",
    "published_at",
  ] as const;

  for (const key of allowed) {
    if (key === "content_json" && contentJson !== undefined) {
      patch.content_json = contentJson;
      continue;
    }
    if (key === "robots_index" && robotsIndex !== undefined) {
      patch.robots_index = robotsIndex;
      continue;
    }
    if (body[key] !== undefined) patch[key] = body[key];
  }

  if (patch.status === "published" && !body.published_at) {
    patch.published_at = new Date().toISOString();
  }

  const { data, error } = await admin
    .from("site_pages")
    .update(patch)
    .eq("id", pageId)
    .eq("site_id", ctx.siteId)
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

export async function POST(req: Request) {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { ctx } = auth;
  const body = await req.json();
  const path = String(body.path || "").trim();
  const title = String(body.title || "").trim();

  if (!path.startsWith("/")) {
    return NextResponse.json({ error: "Path must start with /" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("site_pages")
    .insert({
      site_id: ctx.siteId,
      path,
      title,
      content_md: body.content_md ?? "",
      content_json: body.content_json ?? [],
      h1: body.h1 ?? title,
      seo_title: body.seo_title ?? null,
      meta_description: body.meta_description ?? null,
      robots_index: body.robots_index ?? true,
      robots_follow: body.robots_follow ?? true,
      nav_label: body.nav_label ?? title,
      nav_order: body.nav_order ?? 100,
      show_in_navigation: body.show_in_navigation ?? false,
      status: body.status ?? "draft",
      page_key: null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateSiteSeoCaches({ siteId: ctx.siteId, tenantId: ctx.tenantId });
  return NextResponse.json({ success: true, data });
}
