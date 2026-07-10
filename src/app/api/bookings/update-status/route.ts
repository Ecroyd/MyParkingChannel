import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase()

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { bookingId, status } = body

  if (!bookingId || !status) {
    return NextResponse.json({ error: 'Missing bookingId or status' }, { status: 400 })
  }

  const validStatuses = ['reserved', 'checked_in', 'checked_out', 'cancelled', 'no_show']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data: existing, error: fetchError } = await supabase
    .from('bookings')
    .select('id, tenant_id')
    .eq('id', bookingId)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const { data: membership } = await supabase
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('tenant_id', existing.tenant_id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ 
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId)
    .eq('tenant_id', existing.tenant_id)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('Error updating booking status:', error)
    return NextResponse.json({ error: error.message || 'Failed to update booking status' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'No booking row was updated' }, { status: 404 })
  }

  return NextResponse.json({ 
    success: true, 
    booking: data 
  })
}
