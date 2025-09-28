import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')
  if (!tenantId) return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })

  const supabase = await getServerSupabase()
  const { data, error } = await supabase
    .from('tenants')
    .select('id, default_capacity')
    .eq('id', tenantId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ default_capacity: data?.default_capacity ?? null })
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null) as { tenant_id?: string; default_capacity?: number } | null
  if (!body?.tenant_id || body.default_capacity == null)
    return NextResponse.json({ error: 'tenant_id and default_capacity required' }, { status: 400 })

  const supabase = await getServerSupabase()
  const { error } = await supabase
    .from('tenants')
    .update({ default_capacity: body.default_capacity })
    .eq('id', body.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

