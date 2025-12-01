import { createAdminClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { zonedTimeToUtc } from 'date-fns-tz'
import { parseISO } from 'date-fns'

export async function POST(request: Request) {
  const supabase = await createAdminClient()
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
  const { plate, event_at } = body

  if (!plate) {
    return Response.json({ error: 'Plate number required' }, { status: 400 })
  }

  const eventTime = event_at ? parseISO(event_at) : new Date()
  const tenantTimezone = device.tenants.timezone || 'Europe/London'

  // Find active booking for this plate
  const { data: booking } = await supabase
    .from('bookings')
    .select('*')
    .eq('tenant_id', device.tenant_id)
    .eq('plate', plate.toUpperCase())
    .in('status', ['reserved', 'checked_in'])
    .lte('start_at', eventTime.toISOString())
    .gte('end_at', eventTime.toISOString())
    .order('start_at', { ascending: false })
    .limit(1)
    .single()

  let result: 'allow' | 'deny' = 'deny'
  let reason = 'No active booking found'
  let bookingId: string | null = null

  if (booking) {
    bookingId = booking.id
    
    // Determine if this is check-in or check-out based on time proximity
    const startTime = parseISO(booking.start_at)
    const endTime = parseISO(booking.end_at)
    const timeToStart = Math.abs(eventTime.getTime() - startTime.getTime()) / (1000 * 60) // minutes
    const timeToEnd = Math.abs(eventTime.getTime() - endTime.getTime()) / (1000 * 60) // minutes
    
    if (booking.status === 'reserved' && timeToStart <= 30) {
      // Check-in: within 30 minutes of start time
      result = 'allow'
      reason = 'Valid check-in'
      
      // Update booking status, timestamps, and gate_status
      await supabase
        .from('bookings')
        .update({ 
          status: 'checked_in',
          checked_in_at: eventTime.toISOString(),
          checked_out_at: null,
          gate_status: 'arrived'
        })
        .eq('id', booking.id)
    } else if (booking.status === 'checked_in' && timeToEnd <= 30) {
      // Check-out: within 30 minutes of end time
      result = 'allow'
      reason = 'Valid check-out'
      
      // Update booking status, timestamps, and gate_status
      await supabase
        .from('bookings')
        .update({ 
          status: 'checked_out',
          checked_out_at: eventTime.toISOString(),
          gate_status: 'departed'
        })
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
      mode: 'anpr',
      plate: plate.toUpperCase(),
      booking_id: bookingId,
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
    booking_id: bookingId,
    plate: plate.toUpperCase(),
    event_at: eventTime.toISOString()
  })
}

