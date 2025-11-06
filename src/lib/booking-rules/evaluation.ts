import { BookingRule, RuleEvaluationResult, BookingDates } from '@/lib/validation/booking-rules'

/**
 * Evaluate booking rules against specific booking dates
 * @param rules Array of booking rules to evaluate
 * @param dates Booking start and end dates
 * @returns Evaluation result with blocking status and surcharge amount
 */
export function evaluateBookingRules(rules: BookingRule[], dates: BookingDates): RuleEvaluationResult {
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
      const dateMatches = evaluateRuleCondition(rule, arrivalDay, arrivalMonth, startDate)
      
      if (dateMatches) {
        // If rule has time restrictions, check them
        if ((rule as any).arrival_time_start && (rule as any).arrival_time_end) {
          const timeMatches = evaluateArrivalTime(rule, startDate)
          matches = matches || timeMatches
        } else {
          // No time restrictions, date match is enough
          matches = matches || dateMatches
        }
      }
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

/**
 * Evaluate a single rule condition against a specific date
 * @param rule The booking rule to evaluate
 * @param dayOfWeek Day of week (0-6, where 0 is Sunday)
 * @param month Month (1-12)
 * @param date The specific date to check
 * @returns True if the rule matches the date
 */
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
    // If date range is specified, also check date
    if (rule.date_range_start && rule.date_range_end) {
      const ruleStartDate = new Date(rule.date_range_start)
      const ruleEndDate = new Date(rule.date_range_end)
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      
      if (dateOnly >= ruleStartDate && dateOnly <= ruleEndDate) {
        return true
      }
    } else {
      return true
    }
  }

  // Check date range only (if no specific days)
  if (rule.date_range_start && rule.date_range_end && !rule.applies_to_days) {
    const ruleStartDate = new Date(rule.date_range_start)
    const ruleEndDate = new Date(rule.date_range_end)
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    
    if (dateOnly >= ruleStartDate && dateOnly <= ruleEndDate) {
      return true
    }
  }

  return false
}

/**
 * Evaluate if arrival time falls within restricted time range
 * @param rule The booking rule with time restrictions
 * @param arrivalDate The arrival date/time
 * @returns True if arrival time is within restricted range
 */
function evaluateArrivalTime(rule: BookingRule, arrivalDate: Date): boolean {
  const arrivalTimeStart = (rule as any).arrival_time_start
  const arrivalTimeEnd = (rule as any).arrival_time_end
  
  if (!arrivalTimeStart || !arrivalTimeEnd) {
    return true // No time restriction, allow
  }
  
  // Extract time from arrival date (HH:mm format)
  const arrivalHours = arrivalDate.getHours()
  const arrivalMinutes = arrivalDate.getMinutes()
  const arrivalTimeMinutes = arrivalHours * 60 + arrivalMinutes
  
  // Parse time range (HH:mm format)
  const [startHours, startMinutes] = arrivalTimeStart.split(':').map(Number)
  const [endHours, endMinutes] = arrivalTimeEnd.split(':').map(Number)
  const startTimeMinutes = startHours * 60 + startMinutes
  const endTimeMinutes = endHours * 60 + endMinutes
  
  // Check if arrival time falls within restricted range
  // Handle case where time range spans midnight (e.g., 22:00 to 06:00)
  if (startTimeMinutes > endTimeMinutes) {
    // Time range spans midnight
    return arrivalTimeMinutes >= startTimeMinutes || arrivalTimeMinutes <= endTimeMinutes
  } else {
    // Normal time range within same day
    return arrivalTimeMinutes >= startTimeMinutes && arrivalTimeMinutes <= endTimeMinutes
  }
}

/**
 * Get a human-readable description of a booking rule
 * @param rule The booking rule to describe
 * @returns Human-readable description
 */
export function getRuleDescription(rule: BookingRule): string {
  const parts: string[] = []
  
  // Add action
  const actionText = rule.rule_kind === 'blackout' ? 'Reject bookings' : 
                     `Add £${rule.surcharge_amount} surcharge`
  parts.push(actionText)
  
  // Add when it applies
  const whenText = rule.type === 'both' ? 'when arriving OR returning' : 
                   rule.type === 'arrival' ? 'when arriving' : 'when returning'
  parts.push(whenText)
  
  // Add conditions
  const conditions: string[] = []
  
  if (rule.specific_date) {
    const date = new Date(rule.specific_date)
    conditions.push(`on ${date.toLocaleDateString()}`)
  }
  
  if (rule.applies_to_days && rule.applies_to_days.length > 0) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const days = rule.applies_to_days.map(d => dayNames[d]).join(', ')
    conditions.push(`on ${days}`)
  }
  
  if (rule.date_range_start && rule.date_range_end) {
    const startDate = new Date(rule.date_range_start)
    const endDate = new Date(rule.date_range_end)
    conditions.push(`from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`)
  }
  
  // Add time restrictions if present
  if ((rule as any).arrival_time_start && (rule as any).arrival_time_end) {
    conditions.push(`between ${(rule as any).arrival_time_start} and ${(rule as any).arrival_time_end}`)
  }
  
  if (conditions.length > 0) {
    parts.push(conditions.join(' '))
  }
  
  return parts.join(' ')
}

/**
 * Validate that a booking rule has at least one condition
 * @param rule The booking rule to validate
 * @returns True if the rule has at least one condition
 */
export function validateRuleConditions(rule: Partial<BookingRule>): boolean {
  return !!(
    rule.applies_to_days?.length ||
    rule.date_range_start ||
    rule.specific_date
  )
}
