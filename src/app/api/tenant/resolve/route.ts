import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain");
  const slug = url.searchParams.get("slug");

  if (!domain && !slug)
    return NextResponse.json({ error: "missing-domain-or-slug" }, { status: 400 });

  const sb = createAdminClient(); // server-only, OK
  let q = sb.from("tenant_domains").select("tenant_id, domain, slug, tenant_id");
  if (domain) q = q.eq("domain", domain);
  if (slug) q = q.eq("slug", slug);

  const { data, error } = await q.single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json({ data }, { status: 200 });
}
