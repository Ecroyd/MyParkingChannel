import { createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function GET(request: Request) {
  const supabase = await createAdminClient()
  
  try {
    // Get all enabled ParkVia channel accounts
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
      .eq('channels.code', 'parkvia')
      .eq('enabled', true)

    if (accountsError) {
      throw accountsError
    }

    if (!channelAccounts || channelAccounts.length === 0) {
      return Response.json({ message: 'No enabled ParkVia accounts found' })
    }

    const results = []

    for (const account of channelAccounts) {
      try {
        const result = await pullParkViaData(supabase, account)
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
    console.error('ParkVia cron error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}

async function pullParkViaData(supabase: any, account: any) {
  const startTime = Date.now()
  
  try {
    // Get sync cursor from tenant secrets
    const { data: cursorSecret } = await supabase
      .from('tenant_secrets')
      .select('value_ciphertext')
      .eq('tenant_id', account.tenant_id)
      .eq('scope', 'parkvia')
      .eq('key', 'sync_cursor')
      .single()

    const lastSync = cursorSecret ? decryptSecret(cursorSecret.value_ciphertext) : null
    const sinceDate = lastSync ? new Date(lastSync) : new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago

    // Get API credentials
    const { data: apiKeySecret } = await supabase
      .from('tenant_secrets')
      .select('value_ciphertext')
      .eq('tenant_id', account.tenant_id)
      .eq('scope', 'parkvia')
      .eq('key', 'api_key')
      .single()

    if (!apiKeySecret) {
      throw new Error('API key not configured')
    }

    const apiKey = decryptSecret(apiKeySecret.value_ciphertext)

    // Fetch reservations from ParkVia API
    const reservations = await fetchParkViaReservations(apiKey, sinceDate)

    let processed = 0
    let errors = 0

    for (const reservation of reservations) {
      try {
        const idempotencyKey = `parkvia_pull_${account.tenant_id}_${reservation.external_id}_${reservation.updated_at}`
        
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
            external_id: reservation.external_id,
            status: reservation.status,
            payload: reservation
          })
          .select()
          .single()

        if (reservationError) {
          throw reservationError
        }

        // Try to map to local booking
        const mappedBooking = await mapToLocalBooking(supabase, account.tenant_id, reservation)
        
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
            event_type: 'reservation_synced',
            idempotency_key: idempotencyKey,
            payload_hash: crypto.createHash('sha256').update(JSON.stringify(reservation)).digest('hex'),
            status: 'success',
            http_status: 200,
            duration_ms: Date.now() - startTime
          })

        processed++
      } catch (error: any) {
        console.error(`Failed to process reservation ${reservation.external_id}:`, error)
        errors++

        // Log failed event
        await supabase
          .from('integration_events')
          .insert({
            tenant_id: account.tenant_id,
            channel_account_id: account.id,
            direction: 'inbound',
            event_type: 'reservation_sync_failed',
            idempotency_key: `parkvia_pull_${account.tenant_id}_${reservation.external_id}_${Date.now()}`,
            payload_hash: crypto.createHash('sha256').update(JSON.stringify(reservation)).digest('hex'),
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
        scope: 'parkvia',
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

async function fetchParkViaReservations(apiKey: string, sinceDate: Date) {
  // TODO: Implement actual ParkVia API call
  // This is a placeholder implementation
  const response = await fetch('https://api.parkvia.com/v1/reservations', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    // Add query parameters for date filtering
  })

  if (!response.ok) {
    throw new Error(`ParkVia API error: ${response.status}`)
  }

  const data = await response.json()
  return data.reservations || []
}

async function mapToLocalBooking(supabase: any, tenantId: string, reservation: any) {
  try {
    // Try to find existing booking by plate and time window
    const startTime = new Date(reservation.start_date)
    const endTime = new Date(reservation.end_date)
    
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('plate', reservation.vehicle_registration?.toUpperCase())
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
        reference: reservation.reference || `PARKVIA_${reservation.external_id}`,
        customer_name: reservation.customer_name || 'Unknown',
        customer_email: reservation.customer_email || '',
        plate: reservation.vehicle_registration?.toUpperCase() || '',
        start_at: startTime.toISOString(),
        end_at: endTime.toISOString(),
        status: 'reserved',
        source: 'parkvia'
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

