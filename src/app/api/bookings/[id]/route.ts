import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServerSupabase()

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data, )
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServerSupabase()

  // Who is calling?
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  // Fetch booking to determine tenant_id
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, tenant_id, start_at, end_at')
    .eq('id', id)
    .single()
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  // Caller must belong to that tenant
  const { data: membership } = await supabase
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', booking.tenant_id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({} as any))
  const allowed = ['plate','flight_number','status','start_at','end_at','money_received','money_charged','source'] as const
  const patch: Record<string, any> = {}
  for (const k of allowed) if (k in body) patch[k] = body[k]

  // Simple server-side validation for extend/edit
  const s = patch.start_at ? new Date(patch.start_at) : new Date(booking.start_at)
  const e = patch.end_at   ? new Date(patch.end_at)   : new Date(booking.end_at)
  if (!(e > s)) return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 400 })

  const { data, error } = await supabase
    .from('bookings')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', booking.tenant_id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, )
}

