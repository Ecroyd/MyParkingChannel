import { NextResponse } from "next/server";
import { createServerClientDirect } from "@/lib/supabase/server-direct";

export const dynamic = "force-dynamic";

export async function GET() {
  let urlHost = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  try { urlHost = new URL(urlHost).host; } catch {}

  const sb = createServerClientDirect({ admin: true });
  const { data, error } = await sb
    .from("tenants")
    .select("id, slug, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

  return NextResponse.json({
    env: { urlHost, serviceRolePresent: !!process.env.SUPABASE_SERVICE_ROLE_KEY },
    ok: !error,
    error: error?.message ?? null,
    tenants: data ?? [],
  });
}
