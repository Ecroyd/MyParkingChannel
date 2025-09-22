import { createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function GET(request: Request) {
  const supabase = createAdminClient()
  
  try {
    // Get all enabled Holiday Extras channel accounts
    const { data: channelAccounts, error: accountsError } = await supabase
      .from('channel_accounts')
      .select(`
        id,
        tenant_id,
        display_name,
        tenant_secrets!inner(
          key,
          value_ciphertext
        )
      `)
      .eq('channels.code', 'holidayextras')
      .eq('enabled', true)

    if (accountsError) {
      throw accountsError
    }

    if (!channelAccounts || channelAccounts.length === 0) {
      return Response.json({ message: 'No enabled Holiday Extras accounts found' })
    }

    const results = []

    for (const account of channelAccounts) {
      try {
        const result = await pullHolidayExtrasData(supabase, account)
        results.push(result)
      } catch (error: any) {
        console.error(`Failed to pull data for account ${account.id}:`, error)
        results.push({
          account_id: account.id,
          success: false,
          error: error.message
        })
      }
    }

    return Response.json({ results })
  } catch (error: any) {
    console.error('Holiday Extras cron error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}

async function pullHolidayExtrasData(supabase: any, account: any) {
  const startTime = Date.now()
  
  try {
    // Get sync cursor from tenant secrets
    const { data: cursorSecret } = await supabase
      .from('tenant_secrets')
      .select('value_ciphertext')
      .eq('tenant_id', account.tenant_id)
      .eq('scope', 'holidayextras')
      .eq('key', 'sync_cursor')
      .single()

    const lastSync = cursorSecret ? decryptSecret(cursorSecret.value_ciphertext) : null
    const sinceDate = lastSync ? new Date(lastSync) : new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago

    // Get API credentials
    const { data: apiKeySecret } = await supabase
      .from('tenant_secrets')
      .select('value_ciphertext')
      .eq('tenant_id', account.tenant_id)
      .eq('scope', 'holidayextras')
      .eq('key', 'api_key')
      .single()

    if (!apiKeySecret) {
      throw new Error('API key not configured')
    }

    const apiKey = decryptSecret(apiKeySecret.value_ciphertext)

    // Fetch bookings from Holiday Extras API
    const bookings = await fetchHolidayExtrasBookings(apiKey, sinceDate)

    let processed = 0
    let errors = 0

    for (const booking of bookings) {
      try {
        const idempotencyKey = `holidayextras_pull_${account.tenant_id}_${booking.booking_reference}_${booking.updated_at}`
        
        // Check if already processed
        const { data: existingEvent } = await supabase
          .from('integration_events')
          .select('id')
          .eq('idempotency_key', idempotencyKey)
          .single()

        if (existingEvent) {
          continue
        }

        // Upsert channel reservation
        const { data: channelReservation, error: reservationError } = await supabase
          .from('channel_reservations')
          .upsert({
            tenant_id: account.tenant_id,
            channel_account_id: account.id,
            external_id: booking.booking_reference,
            status: booking.status,
            payload: booking
          })
          .select()
          .single()

        if (reservationError) {
          throw reservationError
        }

        // Try to map to local booking
        const mappedBooking = await mapToLocalBooking(supabase, account.tenant_id, booking)
        
        if (mappedBooking) {
          await supabase
            .from('channel_reservations')
            .update({ mapped_booking_id: mappedBooking.id })
            .eq('id', channelReservation.id)
        }

        // Log integration event
        await supabase
          .from('integration_events')
          .insert({
            tenant_id: account.tenant_id,
            channel_account_id: account.id,
            direction: 'inbound',
            event_type: 'booking_synced',
            idempotency_key: idempotencyKey,
            payload_hash: crypto.createHash('sha256').update(JSON.stringify(booking)).digest('hex'),
            status: 'success',
            http_status: 200,
            duration_ms: Date.now() - startTime
          })

        processed++
      } catch (error: any) {
        console.error(`Failed to process booking ${booking.booking_reference}:`, error)
        errors++

        // Log failed event
        await supabase
          .from('integration_events')
          .insert({
            tenant_id: account.tenant_id,
            channel_account_id: account.id,
            direction: 'inbound',
            event_type: 'booking_sync_failed',
            idempotency_key: `holidayextras_pull_${account.tenant_id}_${booking.booking_reference}_${Date.now()}`,
            payload_hash: crypto.createHash('sha256').update(JSON.stringify(booking)).digest('hex'),
            status: 'failed',
            http_status: 500,
            duration_ms: Date.now() - startTime
          })
      }
    }

    // Update sync cursor
    const newCursor = new Date().toISOString()
    await supabase
      .from('tenant_secrets')
      .upsert({
        tenant_id: account.tenant_id,
        scope: 'holidayextras',
        key: 'sync_cursor',
        value_ciphertext: encryptSecret(newCursor),
        updated_at: new Date().toISOString()
      })

    return {
      account_id: account.id,
      success: true,
      processed,
      errors,
      duration_ms: Date.now() - startTime
    }
  } catch (error: any) {
    return {
      account_id: account.id,
      success: false,
      error: error.message,
      duration_ms: Date.now() - startTime
    }
  }
}

async function fetchHolidayExtrasBookings(apiKey: string, sinceDate: Date) {
  // TODO: Implement actual Holiday Extras API call
  // This is a placeholder implementation
  const response = await fetch('https://api.holidayextras.com/v1/bookings', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    // Add query parameters for date filtering
  })

  if (!response.ok) {
    throw new Error(`Holiday Extras API error: ${response.status}`)
  }

  const data = await response.json()
  return data.bookings || []
}

async function mapToLocalBooking(supabase: any, tenantId: string, booking: any) {
  try {
    // Try to find existing booking by plate and time window
    const startTime = new Date(booking.start_date)
    const endTime = new Date(booking.end_date)
    
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('plate', booking.vehicle_registration?.toUpperCase())
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
        reference: booking.booking_reference || `HE_${booking.booking_id}`,
        customer_name: booking.customer_name || 'Unknown',
        customer_email: booking.customer_email || '',
        plate: booking.vehicle_registration?.toUpperCase() || '',
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

function encryptSecret(value: string): string {
  // TODO: Implement proper encryption using ENCRYPTION_KEY
  return Buffer.from(value).toString('base64')
}

function decryptSecret(encryptedValue: string): string {
  // TODO: Implement proper decryption using ENCRYPTION_KEY
  return Buffer.from(encryptedValue, 'base64').toString()
}

