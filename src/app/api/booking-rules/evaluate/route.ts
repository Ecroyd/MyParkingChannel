import { NextRequest, NextResponse } from 'next/server'
import { withTenant } from '@/lib/tenant/withTenant'
import { createTenantScopedClient } from '@/lib/rls/context'
import { requireUser } from '@/lib/auth/requireUser'
import { TenantContext } from '@/lib/tenant/resolveTenant'
import { BookingRule, RuleEvaluationResult, BookingDates } from '@/lib/validation/booking-rules'

// POST /api/booking-rules/evaluate - Evaluate booking rules against specific dates
export const POST = withTenant(async (tenant: TenantContext, request: NextRequest) => {
  const user = await requireUser()
  const supabase = await createTenantScopedClient(tenant, user.id)
  
  const body = await request.json()
  const { start_at, end_at } = body as BookingDates
  
  if (!start_at || !end_at) {
    return NextResponse.json({ 
      error: 'start_at and end_at are required' 
    }, { status: 400 })
  }

  // Get all booking rules for the tenant
  const { data: rules, error } = await supabase
    .from('booking_rules')
    .select('*')
    .eq('tenant_id', tenant.tenant_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Evaluate rules against the booking dates
  const result = evaluateBookingRules(rules || [], { start_at, end_at })

  return NextResponse.json({ data: result })
})

// Helper function to evaluate booking rules
function evaluateBookingRules(rules: BookingRule[], dates: BookingDates): RuleEvaluationResult {
  const startDate = new Date(dates.start_at)
  const endDate = new Date(dates.end_at)
  
  const arrivalDay = startDate.getDay() // 0 = Sunday, 6 = Saturday
  const arrivalMonth = startDate.getMonth() + 1 // 1-12
  const returnDay = endDate.getDay()
  const returnMonth = endDate.getMonth() + 1
  
  let isBlocked = false
  let totalSurcharge = 0
  const matchedRules: BookingRule[] = []

  for (const rule of rules) {
    let matches = false

    // Check if rule applies to arrival
    if (rule.type === 'arrival' || rule.type === 'both') {
      matches = matches || evaluateRuleCondition(rule, arrivalDay, arrivalMonth, startDate)
    }

    // Check if rule applies to return
    if (rule.type === 'return' || rule.type === 'both') {
      matches = matches || evaluateRuleCondition(rule, returnDay, returnMonth, endDate)
    }

    if (matches) {
      matchedRules.push(rule)
      
      if (rule.rule_kind === 'blackout') {
        isBlocked = true
      } else if (rule.rule_kind === 'surcharge' && rule.surcharge_amount) {
        totalSurcharge += rule.surcharge_amount
      }
    }
  }

  return {
    isBlocked,
    surchargeAmount: totalSurcharge,
    matchedRules
  }
}

// Helper function to evaluate a single rule condition
function evaluateRuleCondition(
  rule: BookingRule, 
  dayOfWeek: number, 
  month: number, 
  date: Date
): boolean {
  // Check specific date override
  if (rule.specific_date) {
    const ruleDate = new Date(rule.specific_date)
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const ruleDateOnly = new Date(ruleDate.getFullYear(), ruleDate.getMonth(), ruleDate.getDate())
    if (dateOnly.getTime() === ruleDateOnly.getTime()) {
      return true
    }
  }

  // Check day of week
  if (rule.applies_to_days && rule.applies_to_days.includes(dayOfWeek)) {
    // If month range is specified, also check month
    if ((rule as any).month_range) {
      const [startMonth, endMonth] = (rule as any).month_range
      if (month >= startMonth && month <= endMonth) {
        return true
      }
    } else {
      return true
    }
  }

  // Check month range only (if no specific days)
  if ((rule as any).month_range && !rule.applies_to_days) {
    const [startMonth, endMonth] = (rule as any).month_range
    if (month >= startMonth && month <= endMonth) {
      return true
    }
  }

  return false
}
