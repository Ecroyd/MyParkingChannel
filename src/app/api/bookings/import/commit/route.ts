import { NextResponse } from 'next/server';
import { getServerSupabase, supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await getServerSupabase();
    const admin = supabaseAdmin();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { tenantId } = await req.json();
    if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

    // Optional: verify caller is a tenant admin/owner (defense in depth)
    const { data: allowed } = await admin.rpc('has_tenant_role', {
      p_tenant_id: tenantId,
      p_roles: ['owner','admin'],
    });
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Execute commit as service role via security definer RPC
    const { data, error } = await admin.rpc('booking_import_commit', {
      p_tenant_id: tenantId,
      p_actor: user.id,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, result: data });
  } catch (e: any) {
    console.error('IMPORT_COMMIT_FATAL', e);
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}