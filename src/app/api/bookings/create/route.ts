import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import crypto from 'crypto'
import { evaluateBookingRules } from '@/lib/booking-rules/evaluation'
import { BookingRule } from '@/lib/validation/booking-rules'

type Body = {
  reference?: string
  customer_name: string
  customer_email: string
  plate: string
  startAt: string // ISO or datetime-local string
  endAt: string   // ISO or datetime-local string
  money_charged?: number
  money_received?: number
  notes?: string
  flight_number?: string
  tenantId?: string // optional override if you support switching tenants
}

function roundToMinute(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  d.setSeconds(0, 0)
  return d.toISOString()
}

function makeDedupeKey(n: {
  reference?: string
  plate?: string | null
  customer_email?: string | null
  start_at?: string
  end_at?: string
}) {
  if (n.reference) return `ref:${String(n.reference).toLowerCase()}`

  const basis =
    (n.plate ? n.plate.toUpperCase() : '') ||
    (n.customer_email ? n.customer_email.toLowerCase() : '') ||
    'unknown'

  const startM = roundToMinute(n.start_at)
  const endM   = roundToMinute(n.end_at)
  const raw = `${basis}|${startM}|${endM}`
  const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16)
  return `sig:${hash}`
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body

  const supabase = await getServerSupabase()

  // 1) who is the user?
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2) resolve tenant id (if you have a "current tenant" cookie/context, use it; otherwise first membership)
  let tenantId = body.tenantId
  if (!tenantId) {
    const { data: mem } = await supabase
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    tenantId = mem?.tenant_id ?? null
  }
  if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400 })

  // 3) normalize times → TIMESTAMPTZ
  const start_at = new Date(body.startAt)
  const end_at = new Date(body.endAt)
  if (Number.isNaN(start_at.getTime()) || Number.isNaN(end_at.getTime())) {
    return NextResponse.json({ error: 'Invalid dates' }, { status: 400 })
  }

  // 4) Check booking rules
  const { data: rules, error: rulesError } = await supabase
    .from('booking_rules')
    .select('*')
    .eq('tenant_id', tenantId)

  if (rulesError) {
    return NextResponse.json({ error: 'Failed to check booking rules' }, { status: 500 })
  }

  const ruleEvaluation = evaluateBookingRules(rules as BookingRule[], {
    start_at: start_at.toISOString(),
    end_at: end_at.toISOString()
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

  // 5) insert booking (RLS will enforce membership)
  const baseAmount = body.money_charged ?? 0
  const surchargeAmount = ruleEvaluation.surchargeAmount
  const totalAmount = baseAmount + surchargeAmount

  const payload = {
    tenant_id: tenantId,
    reference: body.reference?.trim() || `M-${Date.now()}`,
    customer_name: body.customer_name,
    customer_email: body.customer_email,
    plate: body.plate.toUpperCase().replace(/\s+/g, ''),
    start_at,
    end_at,
    status: 'reserved',
    source: 'manual',
    money_charged: totalAmount,
    money_received: body.money_received ?? 0,
    notes: body.notes ?? null,
    flight_number: body.flight_number?.toUpperCase() || null,
    is_incomplete: false,
    missing_fields: null,
    dedupe_key: makeDedupeKey({
      reference: body.reference?.trim() || `M-${Date.now()}`,
      plate: body.plate.toUpperCase().replace(/\s+/g, ''),
      customer_email: body.customer_email,
      start_at: start_at.toISOString(),
      end_at: end_at.toISOString()
    })
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert(payload)
    .select('id, reference')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  
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

