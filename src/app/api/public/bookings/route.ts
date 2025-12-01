import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { evaluateBookingRules } from '@/lib/booking-rules/evaluation'
import { BookingRule } from '@/lib/validation/booking-rules'
import { makeDedupeKey, checkDuplicateBooking } from '@/lib/bookings/dedupe'

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

    // Comprehensive field validation
    const validationErrors: string[] = []
    
    if (!tenant_id) validationErrors.push('Tenant ID is required')
    if (!customer_name || customer_name.trim().length < 2) validationErrors.push('Full name must be at least 2 characters')
    if (!customer_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) validationErrors.push('Valid email address is required')
    if (!plate || plate.trim().length < 2) validationErrors.push('Vehicle registration must be at least 2 characters')
    if (!start_at) validationErrors.push('Arrival date and time is required')
    if (!end_at) validationErrors.push('Departure date and time is required')
    
    if (validationErrors.length > 0) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: validationErrors,
        field_errors: {
          customer_name: !customer_name || customer_name.trim().length < 2 ? 'Full name must be at least 2 characters' : undefined,
          customer_email: !customer_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email) ? 'Valid email address is required' : undefined,
          plate: !plate || plate.trim().length < 2 ? 'Vehicle registration must be at least 2 characters' : undefined,
          start_at: !start_at ? 'Arrival date and time is required' : undefined,
          end_at: !end_at ? 'Departure date and time is required' : undefined
        }
      }, { status: 400 })
    }
    
    // Parse dates as UK timezone
    const s = parseAsUKTimezone(start_at), e = parseAsUKTimezone(end_at)
    if (!(e > s)) {
      return NextResponse.json({ 
        error: 'Invalid dates', 
        details: ['Departure date and time must be after arrival date and time'],
        field_errors: {
          end_at: 'Departure date and time must be after arrival date and time'
        }
      }, { status: 400 })
    }
    
    // Check if dates are in the past
    const now = new Date()
    if (s < now) {
      return NextResponse.json({ 
        error: 'Invalid dates', 
        details: ['Arrival date and time cannot be in the past'],
        field_errors: {
          start_at: 'Arrival date and time cannot be in the past'
        }
      }, { status: 400 })
    }

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
      const blockingRules = ruleEvaluation.matchedRules.filter(r => r.rule_kind === 'blackout')
      let userFriendlyMessage = 'Bookings are not available for the selected dates and times.'
      
      if (blockingRules.length > 0) {
        const rule = blockingRules[0] // Get the first blocking rule for user-friendly message
        let timeMessage = ''
        
        // Check for time restrictions
        if ((rule as any).arrival_time_start && (rule as any).arrival_time_end) {
          timeMessage = ` Access will be unavailable between ${(rule as any).arrival_time_start} and ${(rule as any).arrival_time_end}.`
        }
        
        if (rule.specific_date) {
          const date = new Date(rule.specific_date).toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })
          userFriendlyMessage = `Bookings are not available on ${date}.${timeMessage} Please select different dates and times.`
        } else if (rule.applies_to_days && (rule as any).month_range) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
          const days = rule.applies_to_days.map(d => dayNames[d]).join(', ')
          const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                             'July', 'August', 'September', 'October', 'November', 'December']
          const [startMonth, endMonth] = (rule as any).month_range
          const monthRange = startMonth === endMonth ? 
            monthNames[startMonth] : 
            `${monthNames[startMonth]} to ${monthNames[endMonth]}`
          userFriendlyMessage = `Bookings are not available on ${days} in ${monthRange}.${timeMessage} Please select different dates and times.`
        } else if ((rule as any).arrival_time_start && (rule as any).arrival_time_end) {
          // Time-only restriction
          userFriendlyMessage = `Bookings arriving between ${(rule as any).arrival_time_start} and ${(rule as any).arrival_time_end} are not available. Access will be unavailable at that time. Please select a different arrival time.`
        }
      }
      
      return NextResponse.json({ 
        error: userFriendlyMessage,
        details: ['Please select different dates and times for your booking.'],
        blocked: true
      }, { status: 400 })
    }

  const baseAmount = 0 // Public bookings start with 0, surcharges will be added
  const surchargeAmount = ruleEvaluation.surchargeAmount
  const totalAmount = baseAmount + surchargeAmount

  // Normalize plate
  const normalizedPlate = plate ? plate.toUpperCase().replace(/\s+/g, '') : null

  // Generate dedupe key to check for duplicates
  const dedupeKey = makeDedupeKey({
    plate: normalizedPlate,
    customer_email: customer_email,
    start_at: s.toISOString(),
    end_at: e.toISOString()
  })

  // Check for duplicate booking
  if (dedupeKey) {
    const existing = await checkDuplicateBooking(admin, tenant_id, dedupeKey)
    if (existing) {
      // Return existing booking instead of creating duplicate
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
    plate: normalizedPlate,
    flight_number: flight_number || null, // Convert undefined to null
    start_at: s.toISOString(),
    end_at: e.toISOString(),
    status: 'reserved', // Use 'reserved' instead of 'pending' since 'pending' is not in the enum
    source: 'other', // Use 'other' instead of 'website' since 'website' is not in the enum
    money_received: 0,
    money_charged: totalAmount,
    reference: generateReference(), // Generate a unique reference
    dedupe_key: dedupeKey
  }

    const { data, error } = await admin.from('bookings').insert(insert).select('id').single()
    
    // Handle potential duplicate key error gracefully
    if (error) {
      // If it's a unique constraint violation, try to fetch the existing booking
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
        if (dedupeKey) {
          const existing = await checkDuplicateBooking(admin, tenant_id, dedupeKey)
          if (existing) {
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


