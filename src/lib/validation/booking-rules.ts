import { z } from 'zod'

// Day of week enum (0 = Sunday, 6 = Saturday)
export const dayOfWeekSchema = z.number().int().min(0).max(6)

// Date range schema
export const dateRangeStartSchema = z.string().date().nullable().optional()
export const dateRangeEndSchema = z.string().date().nullable().optional()

// Booking rule type schema
export const bookingRuleTypeSchema = z.enum(['arrival', 'return', 'both'])

// Booking rule kind schema
export const bookingRuleKindSchema = z.enum(['blackout', 'surcharge'])

// Main booking rule schema
export const bookingRuleSchema = z.object({
  id: z.string().uuid().optional(),
  tenant_id: z.string().uuid(),
  type: bookingRuleTypeSchema,
  rule_kind: bookingRuleKindSchema,
  
  // Recurrence rules
  applies_to_days: z.array(dayOfWeekSchema).nullable().optional(),
  date_range_start: dateRangeStartSchema,
  date_range_end: dateRangeEndSchema,
  
  // One-off date override
  specific_date: z.string().date().nullable().optional(),
  
  // Surcharge settings
  surcharge_amount: z.number().positive().nullable().optional(),
  
  notes: z.string().optional(),
  created_at: z.string().datetime().optional()
})

// Schema for creating a new booking rule
export const createBookingRuleSchema = bookingRuleSchema.omit({
  id: true,
  created_at: true
}).refine(
  (data) => {
    // At least one condition must be specified
    return data.applies_to_days || data.date_range_start || data.specific_date
  },
  {
    message: "At least one condition (days, date range, or specific date) must be specified",
    path: ["applies_to_days"]
  }
).refine(
  (data) => {
    // Surcharge amount is required for surcharge rules
    if (data.rule_kind === 'surcharge') {
      return data.surcharge_amount !== null && data.surcharge_amount !== undefined
    }
    return true
  },
  {
    message: "Surcharge amount is required for surcharge rules",
    path: ["surcharge_amount"]
  }
).refine(
  (data) => {
    // Surcharge amount must be null for blackout rules
    if (data.rule_kind === 'blackout') {
      return data.surcharge_amount === null || data.surcharge_amount === undefined
    }
    return true
  },
  {
    message: "Surcharge amount must be null for blackout rules",
    path: ["surcharge_amount"]
  }
)

// Schema for updating a booking rule
export const updateBookingRuleSchema = bookingRuleSchema.omit({
  id: true,
  tenant_id: true,
  created_at: true
}).partial().refine(
  (data) => {
    // At least one condition must be specified if any are provided
    const hasConditions = data.applies_to_days?.length || data.date_range_start || data.specific_date
    if (hasConditions) {
      return data.applies_to_days?.length || data.date_range_start || data.specific_date
    }
    return true // Allow partial updates without conditions
  },
  {
    message: "At least one condition (days, date range, or specific date) must be specified",
    path: ["applies_to_days"]
  }
).refine(
  (data) => {
    // Surcharge amount is required for surcharge rules
    if (data.rule_kind === 'surcharge') {
      return data.surcharge_amount !== null && data.surcharge_amount !== undefined
    }
    return true
  },
  {
    message: "Surcharge amount is required for surcharge rules",
    path: ["surcharge_amount"]
  }
).refine(
  (data) => {
    // Surcharge amount must be null for blackout rules
    if (data.rule_kind === 'blackout') {
      return data.surcharge_amount === null || data.surcharge_amount === undefined
    }
    return true
  },
  {
    message: "Surcharge amount must be null for blackout rules",
    path: ["surcharge_amount"]
  }
)

// Type exports
export type BookingRule = z.infer<typeof bookingRuleSchema>
export type CreateBookingRule = z.infer<typeof createBookingRuleSchema>
export type UpdateBookingRule = z.infer<typeof updateBookingRuleSchema>
export type BookingRuleType = z.infer<typeof bookingRuleTypeSchema>
export type BookingRuleKind = z.infer<typeof bookingRuleKindSchema>

// Helper types for rule evaluation
export type RuleEvaluationResult = {
  isBlocked: boolean
  surchargeAmount: number
  matchedRules: BookingRule[]
}

export type BookingDates = {
  start_at: string
  end_at: string
}
