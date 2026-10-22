import { evaluateBookingRules } from '../evaluation'
import { BookingRule } from '@/lib/validation/booking-rules'

// Mock booking rules for testing
const mockRules: BookingRule[] = [
  {
    id: '1',
    tenant_id: 'tenant-1',
    type: 'return',
    rule_kind: 'blackout',
    applies_to_days: [6, 0], // Saturday and Sunday
    date_range_start: '2024-04-01', // April to October
    date_range_end: '2024-10-31',
    specific_date: null,
    surcharge_amount: null,
    notes: 'No weekend returns Apr-Oct',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '2',
    tenant_id: 'tenant-1',
    type: 'arrival',
    rule_kind: 'surcharge',
    applies_to_days: [5], // Friday
    date_range_start: '2024-08-01', // August only
    date_range_end: '2024-08-31',
    specific_date: null,
    surcharge_amount: 15,
    notes: 'Peak Friday arrivals in August',
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '3',
    tenant_id: 'tenant-1',
    type: 'both',
    rule_kind: 'blackout',
    applies_to_days: null,
    specific_date: '2024-12-25',
    surcharge_amount: null,
    notes: 'Christmas Day closed',
    created_at: '2024-01-01T00:00:00Z'
  }
]

describe('Booking Rules Evaluation', () => {
  test('should block weekend returns in summer', () => {
    // Saturday return in June (should be blocked)
    const result = evaluateBookingRules(mockRules, {
      start_at: '2024-06-15T10:00:00Z', // Saturday arrival
      end_at: '2024-06-16T18:00:00Z'    // Sunday return
    })

    expect(result.isBlocked).toBe(true)
    expect(result.surchargeAmount).toBe(0)
    expect(result.matchedRules).toHaveLength(1)
    expect(result.matchedRules[0].id).toBe('1')
  })

  test('should apply surcharge for Friday arrivals in August', () => {
    // Friday arrival in August (should have surcharge)
    const result = evaluateBookingRules(mockRules, {
      start_at: '2024-08-16T10:00:00Z', // Friday arrival
      end_at: '2024-08-20T18:00:00Z'    // Tuesday return (avoids weekend-return blackout)
    })

    expect(result.isBlocked).toBe(false)
    expect(result.surchargeAmount).toBe(15)
    expect(result.matchedRules).toHaveLength(1)
    expect(result.matchedRules[0].id).toBe('2')
  })

  test('should block Christmas Day bookings', () => {
    // Christmas Day booking (should be blocked)
    const result = evaluateBookingRules(mockRules, {
      start_at: '2024-12-25T10:00:00Z',
      end_at: '2024-12-27T18:00:00Z'
    })

    expect(result.isBlocked).toBe(true)
    expect(result.surchargeAmount).toBe(0)
    expect(result.matchedRules).toHaveLength(1)
    expect(result.matchedRules[0].id).toBe('3')
  })

  test('should allow normal weekday bookings', () => {
    // Tuesday to Thursday booking (should be allowed)
    const result = evaluateBookingRules(mockRules, {
      start_at: '2024-06-11T10:00:00Z', // Tuesday arrival
      end_at: '2024-06-13T18:00:00Z'    // Thursday return
    })

    expect(result.isBlocked).toBe(false)
    expect(result.surchargeAmount).toBe(0)
    expect(result.matchedRules).toHaveLength(0)
  })

  test('should allow weekend returns in winter', () => {
    // Saturday return in January (should be allowed)
    const result = evaluateBookingRules(mockRules, {
      start_at: '2024-01-12T10:00:00Z', // Friday arrival
      end_at: '2024-01-13T18:00:00Z'    // Saturday return
    })

    expect(result.isBlocked).toBe(false)
    expect(result.surchargeAmount).toBe(0)
    expect(result.matchedRules).toHaveLength(0)
  })

  test('should combine multiple surcharges', () => {
    // Create additional surcharge rule
    const additionalRules: BookingRule[] = [
      ...mockRules,
      {
        id: '4',
        tenant_id: 'tenant-1',
        type: 'arrival',
        rule_kind: 'surcharge',
        applies_to_days: [5], // Friday
        date_range_start: '2024-08-01', // August
        date_range_end: '2024-08-31',
        specific_date: null,
        surcharge_amount: 10,
        notes: 'Additional Friday surcharge',
        created_at: '2024-01-01T00:00:00Z'
      }
    ]

    // Friday arrival in August (should have both surcharges)
    const result = evaluateBookingRules(additionalRules, {
      start_at: '2024-08-16T10:00:00Z', // Friday arrival
      end_at: '2024-08-20T18:00:00Z'    // Tuesday return (avoids weekend-return blackout)
    })

    expect(result.isBlocked).toBe(false)
    expect(result.surchargeAmount).toBe(25) // 15 + 10
    expect(result.matchedRules).toHaveLength(2)
  })
})

// Example usage documentation
export const exampleUsage = `
// Example booking rules that can be created:

// 1. Weekend returns closed Apr–Oct
{
  type: 'return',
  rule_kind: 'blackout',
  applies_to_days: [6, 0], // Saturday+Sunday
  date_range_start: '2025-04-01', // April–October
  date_range_end: '2025-10-31',
  notes: 'No Sat/Sun returns Apr–Oct'
}

// 2. Closed 25th Dec
{
  type: 'both',
  rule_kind: 'blackout',
  specific_date: '2025-12-25',
  notes: 'Christmas Day closed'
}

// 3. Surcharge £15 for arrivals on Fridays in August
{
  type: 'arrival',
  rule_kind: 'surcharge',
  applies_to_days: [5],    // Friday
  date_range_start: '2025-08-01', // August
  date_range_end: '2025-08-31',
  surcharge_amount: 15,
  notes: 'Peak Friday arrivals in August'
}
`

describe('timezone handling', () => {
  const saturdayArrivalSurcharge: BookingRule = {
    id: 'tz-1',
    tenant_id: 'tenant-1',
    type: 'arrival',
    rule_kind: 'surcharge',
    applies_to_days: [6],
    date_range_start: null,
    date_range_end: null,
    specific_date: null,
    surcharge_amount: 10,
    notes: 'Saturday arrivals',
    created_at: '2024-01-01T00:00:00Z',
  } as unknown as BookingRule

  it('judges the day in UK time, not server UTC (00:30 BST Saturday = 23:30Z Friday)', () => {
    const result = evaluateBookingRules([saturdayArrivalSurcharge], {
      start_at: '2024-08-02T23:30:00Z',
      end_at: '2024-08-06T10:00:00Z',
    })
    expect(result.surchargeAmount).toBe(10)
  })

  it('does not match a Friday evening arrival in UK time', () => {
    const result = evaluateBookingRules([saturdayArrivalSurcharge], {
      start_at: '2024-08-02T21:30:00Z',
      end_at: '2024-08-06T10:00:00Z',
    })
    expect(result.surchargeAmount).toBe(0)
  })
})
