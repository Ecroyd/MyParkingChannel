import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  const sb = await getServerSupabase();

  const { data: { user }, error: uErr } = await sb.auth.getUser();
  if (uErr) return NextResponse.json({ tenants: [], activeTenantId: null, reason: uErr.message });
  if (!user) return NextResponse.json({ tenants: [], activeTenantId: null, reason: "NO_USER_SESSION" });

  // Step 1: read link table (RLS lets user see only their rows)
  const { data: links, error: lErr } = await sb
    .from("user_tenants")
    .select("tenant_id, is_default")
    .eq("user_id", user.id);

  if (lErr) return NextResponse.json({ tenants: [], activeTenantId: null, reason: `LINKS_ERR:${lErr.message}` });
  if (!links?.length) return NextResponse.json({ tenants: [], activeTenantId: null, reason: "NO_TENANTS_FOR_USER" });

  const ids = links.map(l => l.tenant_id);

  // Step 2: fetch tenants by ids (RLS on tenants must allow this)
  const { data: tenantsRows, error: tErr } = await sb
    .from("tenants")
    .select("id, name")
    .in("id", ids);

  if (tErr) return NextResponse.json({ tenants: [], activeTenantId: null, reason: `TENANTS_ERR:${tErr.message}` });

  const tenants = (tenantsRows ?? []).map(t => ({
    id: t.id, name: t.name, is_default: !!links.find(l => l.tenant_id === t.id)?.is_default
  }));

  const cookieStore = await cookies();
  const cookieTenant = cookieStore.get("pc_active_tenant")?.value || null;
  const activeTenantId = cookieTenant
    ?? tenants.find(t => t.is_default)?.id
    ?? (tenants.length === 1 ? tenants[0].id : null);

  return NextResponse.json({ tenants, activeTenantId });
}
