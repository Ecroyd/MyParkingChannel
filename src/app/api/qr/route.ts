import { createAdminClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { parseISO } from 'date-fns'

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const headersList = await headers()
  const apiKey = headersList.get('x-api-key')
  
  if (!apiKey) {
    return Response.json({ error: 'API key required' }, { status: 401 })
  }

  // Find device by API key
  const { data: device, error: deviceError } = await supabase
    .from('gate_devices')
    .select(`
      *,
      tenants!inner(id, slug, timezone)
    `)
    .eq('api_key', apiKey)
    .eq('status', 'active')
    .single()

  if (deviceError || !device) {
    return Response.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const body = await request.json()
  const { code, event_at } = body

  if (!code) {
    return Response.json({ error: 'QR code required' }, { status: 400 })
  }

  const eventTime = event_at ? parseISO(event_at) : new Date()

  // Parse QR code to get booking ID or reference
  let bookingId: string | null = null
  let bookingReference: string | null = null

  try {
    // Try to parse as booking ID first
    if (code.length === 36) {
      // UUID format
      bookingId = code
    } else {
      // Assume it's a booking reference
      bookingReference = code
    }
  } catch {
    return Response.json({ error: 'Invalid QR code format' }, { status: 400 })
  }

  // Find booking
  let query = supabase
    .from('bookings')
    .select('*')
    .eq('tenant_id', device.tenant_id)
    .in('status', ['reserved', 'checked_in'])

  if (bookingId) {
    query = query.eq('id', bookingId)
  } else if (bookingReference) {
    query = query.eq('reference', bookingReference)
  }

  const { data: booking } = await query
    .lte('start_at', eventTime.toISOString())
    .gte('end_at', eventTime.toISOString())
    .single()

  let result: 'allow' | 'deny' = 'deny'
  let reason = 'No active booking found'

  if (booking) {
    const startTime = parseISO(booking.start_at)
    const endTime = parseISO(booking.end_at)
    const timeToStart = Math.abs(eventTime.getTime() - startTime.getTime()) / (1000 * 60) // minutes
    const timeToEnd = Math.abs(eventTime.getTime() - endTime.getTime()) / (1000 * 60) // minutes
    
    if (booking.status === 'reserved' && timeToStart <= 30) {
      // Check-in: within 30 minutes of start time
      result = 'allow'
      reason = 'Valid check-in'
      
      // Update booking status
      await supabase
        .from('bookings')
        .update({ status: 'checked_in' })
        .eq('id', booking.id)
    } else if (booking.status === 'checked_in' && timeToEnd <= 30) {
      // Check-out: within 30 minutes of end time
      result = 'allow'
      reason = 'Valid check-out'
      
      // Update booking status
      await supabase
        .from('bookings')
        .update({ status: 'checked_out' })
        .eq('id', booking.id)
    } else if (booking.status === 'checked_in') {
      result = 'allow'
      reason = 'Already checked in'
    } else {
      result = 'deny'
      reason = 'Outside check-in window'
    }
  }

  // Log gate event
  await supabase
    .from('gate_events')
    .insert({
      tenant_id: device.tenant_id,
      device_id: device.id,
      event_at: eventTime.toISOString(),
      mode: 'qr',
      qr_code: code,
      booking_id: booking?.id || null,
      result,
      reason
    })

  // Update device last seen
  await supabase
    .from('gate_devices')
    .update({ last_seen: eventTime.toISOString() })
    .eq('id', device.id)

  return Response.json({
    result,
    reason,
    booking_id: booking?.id || null,
    qr_code: code,
    event_at: eventTime.toISOString()
  })
}

