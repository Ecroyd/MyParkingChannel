import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (!tenantId) return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })

  const supabase = await getServerSupabase()
  
  try {
    // Get user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Simple check: try to access the tenant data directly
    // RLS will handle the access control

    let q = supabase.from('tenant_capacity').select('*').eq('tenant_id', tenantId)
    if (from) q = q.gte('date', from)
    if (to) q = q.lte('date', to)
    const { data, error } = await q.order('date', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data ?? [] })
  } catch (error) {
    console.error("Capacity overrides GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  type Row = { date: string; capacity: number }
  const body = await req.json().catch(() => null) as { tenant_id?: string; rows?: Row[] } | null
  if (!body?.tenant_id || !Array.isArray(body.rows))
    return NextResponse.json({ error: 'tenant_id and rows[] required' }, { status: 400 })

  const supabase = await getServerSupabase()
  
  try {
    // Get user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Simple check: try to access the tenant data directly
    // RLS will handle the access control

    const payload = body.rows.map(r => ({ tenant_id: body.tenant_id!, date: r.date, capacity: r.capacity }))
    const { error } = await supabase.from('tenant_capacity').upsert(payload, { onConflict: 'tenant_id,date' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, upserted: payload.length })
  } catch (error) {
    console.error("Capacity overrides PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant_id')
  const date = url.searchParams.get('date')
  if (!tenantId || !date) return NextResponse.json({ error: 'tenant_id and date required' }, { status: 400 })

  const supabase = await getServerSupabase()
  
  try {
    // Get user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Simple check: try to access the tenant data directly
    // RLS will handle the access control

    const { error } = await supabase.from('tenant_capacity').delete().eq('tenant_id', tenantId).eq('date', date)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Capacity overrides DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

