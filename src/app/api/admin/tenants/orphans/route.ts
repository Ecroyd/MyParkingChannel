// src/app/api/admin/tenants/orphans/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function GET() {
  try {
    const sb = await createAdminClient();
    const { data, error } = await sb.rpc('list_orphan_tenants');
    if (error) throw error;
    return NextResponse.json({ tenants: data ?? [] }, { status: 200 });
  } catch (err: any) {
    console.error('orphans list error:', err);
    return NextResponse.json({ error: { code: err.code ?? 'ORPHANS', message: err.message ?? 'Failed' }}, { status: 500 });
  }
}
