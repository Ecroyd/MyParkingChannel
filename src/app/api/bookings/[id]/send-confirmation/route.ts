import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { queueBookingConfirmationEmails } from '@/lib/email/bookingEmails'

/**
 * POST /api/bookings/[id]/send-confirmation
 * Queue (or re-queue) the customer booking confirmation email.
 * Works for manual bookings without payment, and for resends on request.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await getServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .select(
      'id, tenant_id, reference, customer_name, customer_email, customer_phone, plate, flight_number, start_at, end_at, money_charged, source'
    )
    .eq('id', id)
    .maybeSingle()

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 500 })
  }
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  const { data: membership } = await admin
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('tenant_id', booking.tenant_id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!booking.customer_email?.trim()) {
    return NextResponse.json(
      { error: 'Booking has no customer email address' },
      { status: 400 }
    )
  }

  const result = await queueBookingConfirmationEmails({
    tenantId: booking.tenant_id,
    bookingId: booking.id,
    bookingReference: booking.reference,
    customerName: booking.customer_name || 'Customer',
    customerEmail: booking.customer_email,
    customerPhone: booking.customer_phone,
    plate: booking.plate || '',
    flightNumber: booking.flight_number,
    startAt: booking.start_at,
    endAt: booking.end_at,
    amount: Number(booking.money_charged) || 0,
    currency: 'GBP',
    source: booking.source || 'Manual',
    forceResend: true,
    customerOnly: true,
  })

  if (!result.customerQueued) {
    return NextResponse.json(
      { error: result.error || 'Failed to queue confirmation email' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    queued: true,
    to: booking.customer_email.trim(),
  })
}
