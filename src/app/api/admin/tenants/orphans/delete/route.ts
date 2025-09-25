// src/app/api/admin/tenants/orphans/delete/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function POST(req: Request) {
  try {
    const { slug } = await req.json();
    if (!slug) return NextResponse.json({ error:{code:'BAD_REQ', message:'slug required'}}, { status: 400 });
    const sb = createAdminClient();

    const { data: t, error: selErr } = await sb.from('tenants').select('id').eq('slug', slug).maybeSingle();
    if (selErr) throw selErr;
    if (!t?.id) return NextResponse.json({ error:{code:'NOT_FOUND', message:'No tenant with that slug'}}, { status: 404 });

    const { error: delErr } = await sb.from('tenants').delete().eq('id', t.id);
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true, slug }, { status: 200 });
  } catch (err: any) {
    console.error('delete orphan tenant error:', err);
    return NextResponse.json({ error: { code: err.code ?? 'DELETE', message: err.message ?? 'Failed' }}, { status: 500 });
  }
}
