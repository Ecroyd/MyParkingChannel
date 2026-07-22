import { NextResponse } from "next/server";
import { requireSeoAdminContext } from "@/lib/seo/admin-context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { invalidateSiteSeoCaches } from "@/lib/seo/cache";
import {
  normalizeRedirectPath,
  validateRedirectInput,
} from "@/lib/seo/redirects";
import type { SiteRedirect } from "@/lib/seo/types";

export async function POST(req: Request) {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { ctx } = auth;
  const body = await req.json();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("site_redirects")
    .select("id, old_path, new_path, active")
    .eq("site_id", ctx.siteId);

  const validation = validateRedirectInput({
    oldPath: body.old_path,
    newPath: body.new_path,
    statusCode: Number(body.status_code ?? 301),
    existing: (existing as SiteRedirect[]) ?? [],
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.message, code: validation.error }, { status: 400 });
  }

  const { data, error } = await admin
    .from("site_redirects")
    .insert({
      site_id: ctx.siteId,
      tenant_id: ctx.tenantId,
      old_path: normalizeRedirectPath(body.old_path),
      new_path: body.new_path.trim().startsWith("http")
        ? body.new_path.trim()
        : normalizeRedirectPath(body.new_path),
      status_code: Number(body.status_code ?? 301),
      active: body.active !== false,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateSiteSeoCaches({ siteId: ctx.siteId, tenantId: ctx.tenantId });
  return NextResponse.json({ success: true, data });
}

export async function PUT(req: Request) {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { ctx } = auth;
  const body = await req.json();
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("site_redirects")
    .select("*")
    .eq("id", id)
    .eq("site_id", ctx.siteId)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Redirect not found" }, { status: 404 });
  }

  const { data: existing } = await admin
    .from("site_redirects")
    .select("id, old_path, new_path, active")
    .eq("site_id", ctx.siteId);

  const oldPath = body.old_path ?? row.old_path;
  const newPath = body.new_path ?? row.new_path;
  const statusCode = Number(body.status_code ?? row.status_code);

  const validation = validateRedirectInput({
    oldPath,
    newPath,
    statusCode,
    existing: (existing as SiteRedirect[]) ?? [],
    excludeId: id,
  });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.message, code: validation.error }, { status: 400 });
  }

  const { data, error } = await admin
    .from("site_redirects")
    .update({
      old_path: normalizeRedirectPath(oldPath),
      new_path: String(newPath).trim().startsWith("http")
        ? String(newPath).trim()
        : normalizeRedirectPath(newPath),
      status_code: statusCode,
      active: body.active ?? row.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("site_id", ctx.siteId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateSiteSeoCaches({ siteId: ctx.siteId, tenantId: ctx.tenantId });
  return NextResponse.json({ success: true, data });
}

export async function DELETE(req: Request) {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { ctx } = auth;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("site_redirects")
    .delete()
    .eq("id", id)
    .eq("site_id", ctx.siteId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateSiteSeoCaches({ siteId: ctx.siteId, tenantId: ctx.tenantId });
  return NextResponse.json({ success: true });
}
