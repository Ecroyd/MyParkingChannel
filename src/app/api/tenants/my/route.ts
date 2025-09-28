import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function GET() {
  try {
    console.log('🔍 Tenants/my API: Starting tenant fetch...')
    const sb = await createServerClient();
    const adminClient = createAdminClient();

    const { data: { user }, error: uErr } = await sb.auth.getUser();
    if (uErr) {
      console.log('❌ Tenants/my API: User auth error:', uErr.message)
      return NextResponse.json({ tenants: [], activeTenantId: null, reason: uErr.message });
    }
    if (!user) {
      console.log('❌ Tenants/my API: No user session')
      return NextResponse.json({ tenants: [], activeTenantId: null, reason: "NO_USER_SESSION" });
    }

    console.log('✅ Tenants/my API: User authenticated:', user.id, user.email)

    // Step 1: read link table using admin client to bypass RLS
    console.log('🔍 Tenants/my API: Fetching user_tenants for user:', user.id)
    const { data: links, error: lErr } = await adminClient
      .from("user_tenants")
      .select("tenant_id, is_default")
      .eq("user_id", user.id);

    if (lErr) {
      console.log('❌ Tenants/my API: Error fetching user_tenants:', lErr)
      return NextResponse.json({ tenants: [], activeTenantId: null, reason: `LINKS_ERR:${lErr.message}` });
    }
    if (!links?.length) {
      console.log('ℹ️ Tenants/my API: No tenants found for user')
      return NextResponse.json({ tenants: [], activeTenantId: null, reason: "NO_TENANTS_FOR_USER" });
    }

    console.log('📊 Tenants/my API: User tenants found:', links?.length || 0, links)

    const ids = links.map(l => l.tenant_id);

    // Step 2: fetch tenants by ids using admin client
    console.log('🔍 Tenants/my API: Fetching tenant details for IDs:', ids)
    const { data: tenantsRows, error: tErr } = await adminClient
      .from("tenants")
      .select("id, name")
      .in("id", ids);

    if (tErr) {
      console.log('❌ Tenants/my API: Error fetching tenants:', tErr)
      return NextResponse.json({ tenants: [], activeTenantId: null, reason: `TENANTS_ERR:${tErr.message}` });
    }

    console.log('📊 Tenants/my API: Tenant details found:', tenantsRows?.length || 0, tenantsRows)

    const tenants = (tenantsRows ?? []).map(t => ({
      id: t.id, name: t.name, is_default: !!links.find(l => l.tenant_id === t.id)?.is_default
    }));

    const cookieStore = await cookies();
    const cookieTenant = cookieStore.get("pc_active_tenant")?.value || null;
    const activeTenantId = cookieTenant
      ?? tenants.find(t => t.is_default)?.id
      ?? (tenants.length === 1 ? tenants[0].id : null);

    console.log('✅ Tenants/my API: Returning response:', { tenants: tenants.length, activeTenantId })
    return NextResponse.json({ tenants, activeTenantId });

  } catch (err: any) {
    console.error('❌ Tenants/my API: Unexpected error:', err)
    return NextResponse.json({ tenants: [], activeTenantId: null, reason: 'INTERNAL_ERROR' });
  }
}

