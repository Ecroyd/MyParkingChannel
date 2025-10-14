import { NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: Request) {
  try {
    await requireUser() // Adjust to your auth requirements

    const body = await req.json()
    const { tenant_id, site_published } = body as { tenant_id: string; site_published: boolean }

    if (!tenant_id || typeof site_published !== 'boolean') {
      return NextResponse.json({ error: 'tenant_id and site_published required' }, { status: 400 })
    }

    const sb = createAdminClient()
    const { data, error } = await sb
      .from('tenants')
      .update({ site_published })
      .eq('id', tenant_id)
      .select('id, slug, name, site_published')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, tenant: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unauthorised' }, { status: 401 })
  }
}
