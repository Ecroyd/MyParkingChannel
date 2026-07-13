import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { zonedTimeToUtc } from 'date-fns-tz'

const DEFAULT_TZ = 'Europe/London'

/** datetime-local (YYYY-MM-DDTHH:mm) or ISO → UTC ISO, treating naive values as Europe/London. */
function toUtcIso(value: string, timezone: string = DEFAULT_TZ): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return zonedTimeToUtc(`${trimmed}:00`, timezone).toISOString()
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return zonedTimeToUtc(trimmed, timezone).toISOString()
  }
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid datetime: ${value}`)
  }
  return d.toISOString()
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

  const { createAdminClient } = await import('@/lib/supabase/server-admin')
  const adminClient = await createAdminClient()
  
  const { data: booking, error: bErr } = await adminClient
    .from('bookings')
    .select('id, tenant_id, start_at, end_at')
    .eq('id', id)
    .single()
  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 })
  }

  const { data: membership } = await adminClient
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', booking.tenant_id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: tenant } = await adminClient
    .from('tenants')
    .select('timezone')
    .eq('id', booking.tenant_id)
    .maybeSingle()
  const timezone = tenant?.timezone || DEFAULT_TZ

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  
  const allowed = [
    'plate',
    'flight_number',
    'return_flight_number',
    'status',
    'start_at',
    'end_at',
    'money_received',
    'money_charged',
    'source',
    'customer_name',
    'customer_email',
    'customer_phone',
    'notes',
    'car_make',
    'car_model',
    'car_color',
    'highlight_code',
  ] as const

  const patch: Record<string, unknown> = {}
  for (const k of allowed) {
    if (!(k in body)) continue
    const value = body[k]
    // Allow intentional clears (null / empty string → null for nullable text fields)
    if (value === undefined) continue
    if (value === '' || value === null) {
      if (['start_at', 'end_at', 'status'].includes(k)) continue
      patch[k] = null
      continue
    }
    patch[k] = value
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  try {
    if (typeof patch.start_at === 'string') {
      patch.start_at = toUtcIso(patch.start_at, timezone)
    }
    if (typeof patch.end_at === 'string') {
      patch.end_at = toUtcIso(patch.end_at, timezone)
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid datetime' },
      { status: 400 }
    )
  }

  if (typeof patch.plate === 'string') {
    patch.plate = patch.plate.toUpperCase().replace(/\s+/g, '')
  }
  if (typeof patch.flight_number === 'string') {
    patch.flight_number = patch.flight_number.toUpperCase()
  }
  if (typeof patch.return_flight_number === 'string') {
    patch.return_flight_number = patch.return_flight_number.toUpperCase()
  }

  if (patch.start_at || patch.end_at) {
    const s = patch.start_at ? new Date(String(patch.start_at)) : new Date(booking.start_at)
    const e = patch.end_at ? new Date(String(patch.end_at)) : new Date(booking.end_at)
    if (!(e > s)) {
      return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 400 })
    }
  }

  patch.updated_at = new Date().toISOString()

  const { data, error } = await adminClient
    .from('bookings')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', booking.tenant_id)
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Update affected 0 rows — booking was not saved' },
      { status: 409 }
    )
  }

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerSupabase()

  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { createAdminClient } = await import('@/lib/supabase/server-admin')
  const adminClient = await createAdminClient()
  
  const { data: booking, error: bErr } = await adminClient
    .from('bookings')
    .select('id, tenant_id')
    .eq('id', id)
    .single()
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  const { data: membership } = await adminClient
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', booking.tenant_id)
    .maybeSingle()
  
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await adminClient
    .from('bookings')
    .update({
      ops_hidden: true,
      ops_hidden_at: new Date().toISOString(),
      ops_hidden_by: userId,
      ops_hidden_reason: 'hidden_by_user',
    })
    .eq('id', id)
    .eq('tenant_id', booking.tenant_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
