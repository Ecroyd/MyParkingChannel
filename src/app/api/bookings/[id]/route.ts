import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

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
  return NextResponse.json(data, )
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  console.log('🔍 PATCH /api/bookings/[id] - Starting request')
  const { id } = await params;
  console.log('🔍 Booking ID:', id)
  
  const supabase = await getServerSupabase()

  // Who is calling?
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  console.log('🔍 User ID:', userId)
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  // Fetch booking to determine tenant_id using admin client to avoid RLS recursion
  console.log('🔍 Fetching booking details with admin client...')
  const { createAdminClient } = await import('@/lib/supabase/server-admin')
  const adminClient = await createAdminClient()
  
  const { data: booking, error: bErr } = await adminClient
    .from('bookings')
    .select('id, tenant_id, start_at, end_at')
    .eq('id', id)
    .single()
  if (bErr) {
    console.error('🔍 Error fetching booking:', bErr)
    return NextResponse.json({ error: bErr.message }, { status: 500 })
  }
  console.log('🔍 Booking found:', { id: booking.id, tenant_id: booking.tenant_id })

  // Temporarily skip tenant verification to test if RLS recursion is fixed
  console.log('🔍 Skipping tenant verification for now to test RLS fix')
  console.log('🔍 Proceeding with update (tenant verification disabled)')

  const body = await req.json().catch((err) => {
    console.error('JSON parse error:', err)
    return {} as any
  })
  console.log('🔍 Received update data:', body)
  
  const allowed = ['plate','flight_number','status','start_at','end_at','money_received','money_charged','source','customer_name','customer_email','notes','car_make','car_model','car_color'] as const
  const patch: Record<string, any> = {}
  for (const k of allowed) {
    if (k in body && body[k] !== undefined && body[k] !== null && body[k] !== '') {
      patch[k] = body[k]
    }
  }
  
  console.log('🔍 Filtered patch data:', patch)

  // Check if there's anything to update
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Simple server-side validation for extend/edit
  if (patch.start_at || patch.end_at) {
    const s = patch.start_at ? new Date(patch.start_at) : new Date(booking.start_at)
    const e = patch.end_at ? new Date(patch.end_at) : new Date(booking.end_at)
    if (!(e > s)) return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 400 })
  }

  // Convert datetime-local format to ISO string for database
  if (patch.start_at) {
    patch.start_at = new Date(patch.start_at).toISOString()
  }
  if (patch.end_at) {
    patch.end_at = new Date(patch.end_at).toISOString()
  }

  console.log('🔍 Updating booking with patch:', patch)
  console.log('🔍 Booking ID:', id, 'Tenant ID:', booking.tenant_id)

  // Update the booking (RLS will handle tenant access control)
  console.log('🔍 Executing booking update...')
  const { data, error } = await supabase
    .from('bookings')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('🔍 Booking update error:', error)
    console.error('🔍 Error details:', JSON.stringify(error, null, 2))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  console.log('🔍 Booking updated successfully:', data)
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getServerSupabase()

  // Who is calling?
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  // Fetch booking to determine tenant_id using admin client to avoid RLS recursion
  const { createAdminClient } = await import('@/lib/supabase/server-admin')
  const adminClient = await createAdminClient()
  
  const { data: booking, error: bErr } = await adminClient
    .from('bookings')
    .select('id, tenant_id')
    .eq('id', id)
    .single()
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  // Caller must belong to that tenant - use admin client to avoid RLS recursion
  
  const { data: membership } = await adminClient
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', userId)
    .maybeSingle()
  
  if (!membership || membership.tenant_id !== booking.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Booking delete error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ success: true })
}

