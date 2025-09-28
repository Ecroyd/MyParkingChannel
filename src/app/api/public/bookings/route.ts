import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { evaluateBookingRules } from '@/lib/booking-rules/evaluation'
import { BookingRule } from '@/lib/validation/booking-rules'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    tenant_id, customer_name, customer_email, plate, flight_number,
    start_at, end_at, source = 'direct'
  } = body

  if (!tenant_id || !customer_name || !customer_email || !plate || !start_at || !end_at) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const s = new Date(start_at), e = new Date(end_at)
  if (!(e > s)) return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 400 })

  // Use service role for public bookings (bypasses RLS)
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // optional: validate tenant exists
  const { data: t, error: terr } = await admin.from('tenants').select('id').eq('id', tenant_id).single()
  if (terr || !t) return NextResponse.json({ error: 'Invalid tenant' }, { status: 400 })

  // Check booking rules
  const { data: rules, error: rulesError } = await admin
    .from('booking_rules')
    .select('*')
    .eq('tenant_id', tenant_id)

  if (rulesError) {
    return NextResponse.json({ error: 'Failed to check booking rules' }, { status: 500 })
  }

  const ruleEvaluation = evaluateBookingRules(rules as BookingRule[], {
    start_at: s.toISOString(),
    end_at: e.toISOString()
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

  const baseAmount = 0 // Public bookings start with 0, surcharges will be added
  const surchargeAmount = ruleEvaluation.surchargeAmount
  const totalAmount = baseAmount + surchargeAmount

  const insert = {
    tenant_id,
    customer_name,
    customer_email,
    plate,
    flight_number,
    start_at: s.toISOString(),
    end_at: e.toISOString(),
    status: 'pending',
    source,
    money_received: 0,
    money_charged: totalAmount
  }

  const { data, error } = await admin.from('bookings').insert(insert).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  
  // Return booking data with surcharge information
  const response = {
    ok: true, 
    id: data.id,
    surchargeApplied: surchargeAmount > 0,
    surchargeAmount,
    totalAmount
  }
  
  return NextResponse.json(response)
}


