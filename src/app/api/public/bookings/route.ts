import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { evaluateBookingRules } from '@/lib/booking-rules/evaluation'
import { BookingRule } from '@/lib/validation/booking-rules'

// Helper function to treat input dates as UK timezone
function parseAsUKTimezone(dateString: string): Date {
  // Parse the date string and treat it as UK timezone
  const date = new Date(dateString);
  
  // Get the date components in UK timezone
  const ukDate = new Date(date.toLocaleString("en-US", {timeZone: "Europe/London"}));
  
  // Create a new date with the same date/time but explicitly in UK timezone
  const year = ukDate.getFullYear();
  const month = ukDate.getMonth();
  const day = ukDate.getDate();
  const hours = ukDate.getHours();
  const minutes = ukDate.getMinutes();
  const seconds = ukDate.getSeconds();
  
  // Create date in UK timezone (this will be stored as UTC in database)
  return new Date(year, month, day, hours, minutes, seconds);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const {
      tenant_id, customer_name, customer_email, customer_phone, plate, flight_number,
      start_at, end_at, source = 'direct'
    } = body

    if (!tenant_id || !customer_name || !customer_email || !plate || !start_at || !end_at) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }
    // Parse dates as UK timezone
    const s = parseAsUKTimezone(start_at), e = parseAsUKTimezone(end_at)
    if (!(e > s)) return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 400 })

    // Use service role for public bookings (bypasses RLS)
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // optional: validate tenant exists
    const { data: t, error: terr } = await admin.from('tenants').select('id').eq('id', tenant_id).single()
    if (terr || !t) {
      return NextResponse.json({ error: 'Invalid tenant' }, { status: 400 })
    }

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
      return NextResponse.json({ 
        error: 'Bookings are not available for those dates and times. Any questions please get in touch.',
        blocked: true
      }, { status: 400 })
    }

  const baseAmount = 0 // Public bookings start with 0, surcharges will be added
  const surchargeAmount = ruleEvaluation.surchargeAmount
  const totalAmount = baseAmount + surchargeAmount

  // Generate a unique reference for the booking
  const generateReference = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const insert = {
    tenant_id,
    customer_name,
    customer_email,
    customer_phone: customer_phone || null,
    plate,
    flight_number: flight_number || null, // Convert undefined to null
    start_at: s.toISOString(),
    end_at: e.toISOString(),
    status: 'reserved', // Use 'reserved' instead of 'pending' since 'pending' is not in the enum
    source: 'other', // Use 'other' instead of 'website' since 'website' is not in the enum
    money_received: 0,
    money_charged: totalAmount,
    reference: generateReference() // Generate a unique reference
  }

    const { data, error } = await admin.from('bookings').insert(insert).select('id').single()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Return booking data with surcharge information
    const response = {
      ok: true, 
      booking: { id: data.id, reference: `BK${data.id.slice(-6).toUpperCase()}` },
      surchargeApplied: surchargeAmount > 0,
      surchargeAmount,
      totalAmount
    }
    
    return NextResponse.json(response)
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message || 'Failed to create booking' 
    }, { status: 500 })
  }
}


