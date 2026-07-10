import { startOfDay, endOfDay } from 'date-fns'
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz'

/**
 * Authoritative operational booking lifecycle.
 *
 * Precedence for "arrived":
 *   status === 'checked_in'
 *
 * Precedence for "departed":
 *   status === 'checked_out'
 *
 * Excluded from all operational counts and demand:
 *   status === 'cancelled' | 'no_show'
 *
 * Legacy: bookings use `bookings.status` only — no arrived_at / departed_at columns.
 */

export type OperationalBooking = {
  id: string
  reference?: string | null
  customer_name?: string | null
  plate?: string | null
  customer_phone?: string | null
  phone?: string | null
  flight_number?: string | null
  return_flight_number?: string | null
  start_at: string
  end_at: string
  status: string
  updated_at?: string | null
}

export const BOOKING_STATUS = {
  RESERVED: 'reserved',
  CHECKED_IN: 'checked_in',
  CHECKED_OUT: 'checked_out',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
} as const

export function isExcludedFromOperations(status: string): boolean {
  return status === BOOKING_STATUS.CANCELLED || status === BOOKING_STATUS.NO_SHOW
}

/** Vehicle has actually arrived and not departed. */
export function isCurrentlyParked(booking: Pick<OperationalBooking, 'status'>): boolean {
  return booking.status === BOOKING_STATUS.CHECKED_IN
}

/** Scheduled arrival today, not yet checked in. */
export function isArrivalRemaining(
  booking: Pick<OperationalBooking, 'status' | 'start_at'>,
  dayStartUtc: Date,
  dayEndUtc: Date
): boolean {
  if (isExcludedFromOperations(booking.status)) return false
  if (booking.status !== BOOKING_STATUS.RESERVED) return false
  const start = new Date(booking.start_at)
  return start >= dayStartUtc && start < dayEndUtc
}

/** Scheduled departure today, on site but not yet checked out. */
export function isDepartureRemaining(
  booking: Pick<OperationalBooking, 'status' | 'end_at'>,
  dayStartUtc: Date,
  dayEndUtc: Date
): boolean {
  if (isExcludedFromOperations(booking.status)) return false
  if (booking.status !== BOOKING_STATUS.CHECKED_IN) return false
  const end = new Date(booking.end_at)
  return end >= dayStartUtc && end < dayEndUtc
}

/** Future demand forecast — valid bookings only. */
export function countsTowardDemand(booking: Pick<OperationalBooking, 'status'>): boolean {
  return !isExcludedFromOperations(booking.status)
}

export function getCustomerPhone(booking: Pick<OperationalBooking, 'customer_phone' | 'phone'>): string | null {
  const raw = booking.customer_phone?.trim() || booking.phone?.trim()
  return raw || null
}

export function getDepartureFlight(
  booking: Pick<OperationalBooking, 'return_flight_number' | 'flight_number'>
): string | null {
  return booking.return_flight_number?.trim() || booking.flight_number?.trim() || null
}

export function getTodayBoundsUtc(timezone: string, now = new Date()) {
  const tenantDate = utcToZonedTime(now, timezone)
  const todayStart = startOfDay(tenantDate)
  const todayEnd = endOfDay(tenantDate)
  const dayStartUtc = zonedTimeToUtc(todayStart, timezone)
  const dayEndUtc = zonedTimeToUtc(todayEnd, timezone)
  // Use start of next day as exclusive upper bound for range queries
  const nextDayUtc = new Date(dayEndUtc.getTime() + 1)
  return { dayStartUtc, dayEndUtc: nextDayUtc, timezone }
}

export function computeOperationalKpis(
  bookings: OperationalBooking[],
  timezone: string,
  defaultCapacity = 0,
  now = new Date()
) {
  const { dayStartUtc, dayEndUtc } = getTodayBoundsUtc(timezone, now)

  const arrivalsToday = bookings.filter((b) => {
    if (isExcludedFromOperations(b.status)) return false
    const start = new Date(b.start_at)
    return start >= dayStartUtc && start < dayEndUtc
  })

  const departuresToday = bookings.filter((b) => {
    if (isExcludedFromOperations(b.status)) return false
    const end = new Date(b.end_at)
    return end >= dayStartUtc && end < dayEndUtc
  })

  const arrivalsRemaining = arrivalsToday.filter((b) =>
    isArrivalRemaining(b, dayStartUtc, dayEndUtc)
  ).length

  const departuresRemaining = departuresToday.filter((b) =>
    isDepartureRemaining(b, dayStartUtc, dayEndUtc)
  ).length

  const currentlyParked = bookings.filter(isCurrentlyParked)
  const parkedCount = currentlyParked.length

  return {
    arrivalsRemaining,
    departuresRemaining,
    currentlyParked: parkedCount,
    capacityLeft: Math.max(0, defaultCapacity - parkedCount),
    parkedList: currentlyParked,
    arrivalsToday,
    departuresToday,
  }
}

export const BOOKINGS_CHANGED_EVENT = 'parking:bookings-changed'

export function notifyBookingsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BOOKINGS_CHANGED_EVENT))
  }
}
