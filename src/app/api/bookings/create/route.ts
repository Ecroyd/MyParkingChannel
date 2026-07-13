import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { evaluateBookingRules } from '@/lib/booking-rules/evaluation'
import { BookingRule } from '@/lib/validation/booking-rules'
import { makeDedupeKey, checkDuplicateBooking } from '@/lib/bookings/dedupe'

type Body = {
  reference?: string
  customer_name: string
  customer_email: string
  customer_phone?: string
  plate: string
  /** Preferred camelCase keys */
  startAt?: string
  endAt?: string
  /** NewBookingModal historically sent snake_case — accept both */
  start_at?: string
  end_at?: string
  money_charged?: number
  money_received?: number
  notes?: string
  flight_number?: string
  return_flight_number?: string
  car_make?: string
  car_model?: string
  car_color?: string
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body

  const supabase = await getServerSupabase()

  // 1) who is the user?
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2) tenant from authenticated membership only — never trust browser-supplied tenantId
  const adminClient = createAdminClient()
  const { data: membership } = await adminClient
    .from('user_tenants')
    .select('tenant_id, is_default')
    .eq('user_id', user.id)

  if (!membership?.length) {
    return NextResponse.json({ error: 'No tenant context' }, { status: 400 })
  }
  const tenantId =
    membership.find((m) => m.is_default)?.tenant_id ?? membership[0].tenant_id

  // 3) normalize times → TIMESTAMPTZ (treat as UK timezone)
  const startRaw = body.startAt ?? body.start_at
  const endRaw = body.endAt ?? body.end_at
  if (!startRaw || !endRaw) {
    return NextResponse.json({ error: 'Start and end dates are required' }, { status: 400 })
  }
  const start_at = new Date(startRaw)
  const end_at = new Date(endRaw)
  if (Number.isNaN(start_at.getTime()) || Number.isNaN(end_at.getTime())) {
    return NextResponse.json({ error: 'Invalid dates' }, { status: 400 })
  }
  
  // Convert to UK timezone (treat input dates as UK time)
  const start_at_uk = new Date(start_at.toLocaleString("en-US", {timeZone: "Europe/London"}))
  const end_at_uk = new Date(end_at.toLocaleString("en-US", {timeZone: "Europe/London"}))

  // 4) Check booking rules
  const { data: rules, error: rulesError } = await supabase
    .from('booking_rules')
    .select('*')
    .eq('tenant_id', tenantId)

  if (rulesError) {
    return NextResponse.json({ error: 'Failed to check booking rules' }, { status: 500 })
  }

  const ruleEvaluation = evaluateBookingRules(rules as BookingRule[], {
    start_at: start_at_uk.toISOString(),
    end_at: end_at_uk.toISOString()
  })

  // If booking is blocked by rules, return error
  if (ruleEvaluation.isBlocked) {
    const blockingRules = ruleEvaluation.matchedRules.filter(r => r.rule_kind === 'blackout')
    const ruleDescriptions = blockingRules.map(r => {
      if (r.specific_date) {
        return `blocked on ${new Date(r.specific_date).toLocaleDateString()}`
      }
      if (r.applies_to_days && (r as any).month_range) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        const days = r.applies_to_days.map(d => dayNames[d]).join(', ')
        const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December']
        const [startMonth, endMonth] = (r as any).month_range
        const monthRange = startMonth === endMonth ? 
          monthNames[startMonth] : 
          `${monthNames[startMonth]} to ${monthNames[endMonth]}`
        return `blocked on ${days} in ${monthRange}`
      }
      return 'blocked by booking rule'
    })
    
    return NextResponse.json({ 
      error: 'Booking not available', 
      details: `This booking is ${ruleDescriptions.join(' and ')}.`,
      blocked: true
    }, { status: 400 })
  }

  // 5) Generate reference and dedupe key
  const reference = body.reference?.trim() || `M-${Date.now()}`
  const normalizedPlate = body.plate ? body.plate.toUpperCase().replace(/\s+/g, '') : null
  
  const dedupeKey = makeDedupeKey({
    reference: reference,
    plate: normalizedPlate,
    customer_email: body.customer_email,
    start_at: start_at_uk.toISOString(),
    end_at: end_at_uk.toISOString()
  })

  // 6) Check for duplicate booking
  if (dedupeKey) {
    const existing = await checkDuplicateBooking(supabase, tenantId, dedupeKey)
    if (existing) {
      // Return existing booking instead of creating duplicate
      const baseAmount = body.money_charged ?? 0
      const surchargeAmount = ruleEvaluation.surchargeAmount
      const totalAmount = baseAmount + surchargeAmount
      
      return NextResponse.json({
        ok: true,
        booking: { id: existing.id, reference: existing.reference },
        surchargeApplied: surchargeAmount > 0,
        surchargeAmount,
        totalAmount,
        duplicate: true,
        existing: true
      })
    }
  }

  // 7) Insert booking (RLS will enforce membership)
  const baseAmount = body.money_charged ?? 0
  const surchargeAmount = ruleEvaluation.surchargeAmount
  const totalAmount = baseAmount + surchargeAmount

  const payload = {
    tenant_id: tenantId,
    reference: reference,
    customer_name: body.customer_name,
    customer_email: body.customer_email,
    customer_phone: body.customer_phone || null,
    plate: normalizedPlate,
    car_make: body.car_make || null,
    car_model: body.car_model || null,
    car_color: body.car_color || null,
    start_at: start_at_uk.toISOString(),
    end_at: end_at_uk.toISOString(),
    status: 'reserved',
    gate_status: 'reserved',
    source: 'manual',
    money_charged: totalAmount,
    money_received: body.money_received ?? 0,
    notes: body.notes ?? null,
    flight_number: body.flight_number?.toUpperCase() || null,
    return_flight_number: body.return_flight_number?.toUpperCase() || null,
    is_incomplete: false,
    missing_fields: null,
    dedupe_key: dedupeKey
  }

  const { data, error } = await adminClient
    .from('bookings')
    .insert(payload)
    .select('id, reference')
    .single()

  // Handle potential duplicate key error gracefully
  if (error) {
    // If it's a unique constraint violation, try to fetch the existing booking
    if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
      if (dedupeKey) {
        const existing = await checkDuplicateBooking(supabase, tenantId, dedupeKey)
        if (existing) {
          const baseAmount = body.money_charged ?? 0
          const surchargeAmount = ruleEvaluation.surchargeAmount
          const totalAmount = baseAmount + surchargeAmount
          
          return NextResponse.json({
            ok: true,
            booking: { id: existing.id, reference: existing.reference },
            surchargeApplied: surchargeAmount > 0,
            surchargeAmount,
            totalAmount,
            duplicate: true,
            existing: true
          })
        }
      }
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  
  // Sync to Videofit if configured (fire and forget)
  if (data) {
    const { syncBookingToVideofit } = await import('@/lib/videofit/bookingSync');
    const adminClient = createAdminClient();
    void syncBookingToVideofit(
      {
        id: data.id,
        tenant_id: tenantId,
        plate: normalizedPlate,
        start_at: start_at_uk.toISOString(),
        end_at: end_at_uk.toISOString(),
        status: 'reserved',
      },
      'created',
      adminClient
    ).catch((err) => console.error('[Videofit] Background sync error:', err));
  }

  // Return booking data with surcharge information
  const response = {
    ok: true, 
    booking: data,
    surchargeApplied: surchargeAmount > 0,
    surchargeAmount,
    totalAmount
  }
  
  return NextResponse.json(response, )
}

