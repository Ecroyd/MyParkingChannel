import { createAdminClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import crypto from 'crypto'

export async function POST(request: Request) {
  const supabase = await createAdminClient()
  const headersList = await headers()
  
  // Verify webhook signature (implement based on Holiday Extras' documentation)
  const signature = headersList.get('x-holidayextras-signature')
  const body = await request.text()
  
  // TODO: Implement signature verification
  // const expectedSignature = crypto
  //   .createHmac('sha256', process.env.HOLIDAYEXTRAS_WEBHOOK_SECRET!)
  //   .update(body)
  //   .digest('hex')
  
  // if (signature !== expectedSignature) {
  //   return Response.json({ error: 'Invalid signature' }, { status: 401 })
  // }

  try {
    const payload = JSON.parse(body)
    const { event_type, booking_reference, tenant_id, data } = payload

    // Create idempotency key
    const idempotencyKey = `holidayextras_${tenant_id}_${booking_reference}_${event_type}`
    
    // Check if we've already processed this event
    const { data: existingEvent } = await supabase
      .from('integration_events')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .single()

    if (existingEvent) {
      return Response.json({ message: 'Event already processed' })
    }

    // Get channel account for this tenant
    const { data: channelAccount } = await supabase
      .from('channel_accounts')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('channels.code', 'holidayextras')
      .eq('enabled', true)
      .single()

    if (!channelAccount) {
      return Response.json({ error: 'Channel account not found' }, { status: 404 })
    }

    // Process the webhook based on event type
    let result = { success: true, message: 'Processed' }

    switch (event_type) {
      case 'booking_created':
      case 'booking_updated':
        result = await processBooking(supabase, tenant_id, channelAccount.id, booking_reference, data)
        break
      case 'booking_cancelled':
        result = await processCancellation(supabase, tenant_id, channelAccount.id, booking_reference, data)
        break
      default:
        result = { success: false, message: 'Unknown event type' }
    }

    // Log integration event
    await supabase
      .from('integration_events')
      .insert({
        tenant_id,
        channel_account_id: channelAccount.id,
        direction: 'inbound',
        event_type,
        idempotency_key: idempotencyKey,
        payload_hash: crypto.createHash('sha256').update(body).digest('hex'),
        status: result.success ? 'success' : 'failed',
        http_status: 200,
        duration_ms: 0
      })

    return Response.json(result)
  } catch (error: any) {
    console.error('Holiday Extras webhook error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}

async function processBooking(
  supabase: any,
  tenantId: string,
  channelAccountId: string,
  bookingReference: string,
  data: any
) {
  try {
    // Upsert channel reservation
    const { data: reservation, error: reservationError } = await supabase
      .from('channel_reservations')
      .upsert({
        tenant_id: tenantId,
        channel_account_id: channelAccountId,
        external_id: bookingReference,
        status: data.status || 'active',
        payload: data
      })
      .select()
      .single()

    if (reservationError) {
      throw reservationError
    }

    // Try to map to local booking
    const mappedBooking = await mapToLocalBooking(supabase, tenantId, data)
    
    if (mappedBooking) {
      await supabase
        .from('channel_reservations')
        .update({ mapped_booking_id: mappedBooking.id })
        .eq('id', reservation.id)
    }

    return { success: true, message: 'Booking processed', reservation_id: reservation.id }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

async function processCancellation(
  supabase: any,
  tenantId: string,
  channelAccountId: string,
  bookingReference: string,
  data: any
) {
  try {
    // Update channel reservation
    const { error: updateError } = await supabase
      .from('channel_reservations')
      .update({ status: 'cancelled' })
      .eq('tenant_id', tenantId)
      .eq('channel_account_id', channelAccountId)
      .eq('external_id', bookingReference)

    if (updateError) {
      throw updateError
    }

    // Cancel associated booking if exists
    const { data: reservation } = await supabase
      .from('channel_reservations')
      .select('mapped_booking_id')
      .eq('tenant_id', tenantId)
      .eq('channel_account_id', channelAccountId)
      .eq('external_id', bookingReference)
      .single()

    if (reservation?.mapped_booking_id) {
      await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', reservation.mapped_booking_id)
        .eq('tenant_id', tenantId)
    }

    return { success: true, message: 'Cancellation processed' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

async function mapToLocalBooking(supabase: any, tenantId: string, data: any) {
  try {
    // Try to find existing booking by plate and time window
    const startTime = new Date(data.start_date)
    const endTime = new Date(data.end_date)
    
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('plate', data.vehicle_registration?.toUpperCase())
      .gte('start_at', startTime.toISOString())
      .lte('end_at', endTime.toISOString())
      .single()

    if (existingBooking) {
      return existingBooking
    }

    // Create new booking if no match found
    const { data: newBooking, error: createError } = await supabase
      .from('bookings')
      .insert({
        tenant_id: tenantId,
        reference: data.booking_reference || `HE_${data.booking_id}`,
        customer_name: data.customer_name || 'Unknown',
        customer_email: data.customer_email || '',
        plate: data.vehicle_registration?.toUpperCase() || '',
        start_at: startTime.toISOString(),
        end_at: endTime.toISOString(),
        status: 'reserved',
        source: 'holidayextras'
      })
      .select()
      .single()

    if (createError) {
      throw createError
    }

    return newBooking
  } catch (error) {
    console.error('Failed to map to local booking:', error)
    return null
  }
}

