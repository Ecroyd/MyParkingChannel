import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

function parseBookingDatetime(value: string): string {
  if (!value) return value
  if (value.includes('Z') || /[+-]\d{2}:\d{2}$/.test(value)) {
    return new Date(value).toISOString()
  }
  return new Date(`${value}:00.000Z`).toISOString()
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerSupabase()

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerSupabase()

  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, tenant_id, start_at, end_at')
    .eq('id', id)
    .single()
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  const { data: membership } = await supabase
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', booking.tenant_id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  
  const allowed = [
    'plate','flight_number','return_flight_number','status','start_at','end_at',
    'money_received','money_charged','source','customer_name','customer_email',
    'customer_phone','notes','car_make','car_model','car_color',
  ] as const

  const patch: Record<string, unknown> = {}
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      const val = body[k]
      if (val !== undefined) {
        patch[k] = val === '' ? null : val
      }
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  if (patch.start_at || patch.end_at) {
    const s = patch.start_at ? new Date(parseBookingDatetime(String(patch.start_at))) : new Date(booking.start_at)
    const e = patch.end_at ? new Date(parseBookingDatetime(String(patch.end_at))) : new Date(booking.end_at)
    if (!(e > s)) return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 400 })
  }

  if (patch.start_at) patch.start_at = parseBookingDatetime(String(patch.start_at))
  if (patch.end_at) patch.end_at = parseBookingDatetime(String(patch.end_at))
  if (patch.plate && typeof patch.plate === 'string') {
    patch.plate = patch.plate.toUpperCase().replace(/\s+/g, '')
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'customer_phone')) {
    patch.phone = patch.customer_phone
  }

  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('bookings')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', booking.tenant_id)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('Booking update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'No booking row was updated' }, { status: 404 })
  }

  return NextResponse.json(data)
}
