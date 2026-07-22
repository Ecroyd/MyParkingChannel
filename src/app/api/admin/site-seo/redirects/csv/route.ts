import { NextResponse } from "next/server";
import { requireSeoAdminContext } from "@/lib/seo/admin-context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { invalidateSiteSeoCaches } from "@/lib/seo/cache";
import {
  normalizeRedirectPath,
  validateRedirectInput,
} from "@/lib/seo/redirects";
import type { SiteRedirect } from "@/lib/seo/types";

export async function GET() {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("site_redirects")
    .select("*")
    .eq("site_id", auth.ctx.siteId)
    .order("old_path");

  const header = "old_path,new_path,status_code,active\n";
  const rows = (data ?? [])
    .map(
      (r) =>
        `${csv(r.old_path)},${csv(r.new_path)},${r.status_code},${r.active ? "true" : "false"}`
    )
    .join("\n");

  return new NextResponse(header + rows + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="redirects-${auth.ctx.tenantSlug}.csv"`,
    },
  });
}

export async function POST(req: Request) {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { ctx } = auth;
  const text = await req.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
  }

  const header = lines[0].toLowerCase();
  if (!header.includes("old_path") || !header.includes("new_path")) {
    return NextResponse.json(
      { error: "CSV must include old_path and new_path columns" },
      { status: 400 }
    );
  }

  const cols = parseCsvLine(lines[0]);
  const idx = {
    old: cols.findIndex((c) => c.toLowerCase() === "old_path"),
    neu: cols.findIndex((c) => c.toLowerCase() === "new_path"),
    status: cols.findIndex((c) => c.toLowerCase() === "status_code"),
    active: cols.findIndex((c) => c.toLowerCase() === "active"),
  };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("site_redirects")
    .select("id, old_path, new_path, active")
    .eq("site_id", ctx.siteId);

  let existingList = ([...(existing ?? [])] as SiteRedirect[]);
  const imported: unknown[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    const oldPath = parts[idx.old]?.trim();
    const newPath = parts[idx.neu]?.trim();
    if (!oldPath || !newPath) continue;
    const statusCode = Number(parts[idx.status] || 301);
    const active = String(parts[idx.active] ?? "true").toLowerCase() !== "false";

    const validation = validateRedirectInput({
      oldPath,
      newPath,
      statusCode,
      existing: existingList,
    });
    if (!validation.ok) {
      errors.push(`Row ${i + 1}: ${validation.message}`);
      continue;
    }

    const row = {
      site_id: ctx.siteId,
      tenant_id: ctx.tenantId,
      old_path: normalizeRedirectPath(oldPath),
      new_path: newPath.startsWith("http") ? newPath : normalizeRedirectPath(newPath),
      status_code: statusCode === 302 ? 302 : 301,
      active,
    };

    const { data, error } = await admin
      .from("site_redirects")
      .upsert(row, { onConflict: "site_id,old_path" })
      .select("*")
      .single();

    if (error) {
      errors.push(`Row ${i + 1}: ${error.message}`);
      continue;
    }
    imported.push(data);
    existingList = [
      ...existingList.filter((r) => r.old_path !== row.old_path),
      data as SiteRedirect,
    ];
  }

  invalidateSiteSeoCaches({ siteId: ctx.siteId, tenantId: ctx.tenantId });
  return NextResponse.json({
    success: true,
    imported: imported.length,
    errors,
  });
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
