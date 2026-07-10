import { describe, expect, it } from 'vitest'
import {
  computeOperationalKpis,
  countsTowardDemand,
  getDepartureFlight,
  isArrivalRemaining,
  isCurrentlyParked,
  isDepartureRemaining,
  isExcludedFromOperations,
} from '../operational-state'

const tz = 'Europe/London'

function booking(overrides: Record<string, unknown>) {
  return {
    id: '1',
    reference: 'REF1',
    customer_name: 'Test',
    plate: 'AB12CDE',
    start_at: '2026-07-10T08:00:00.000Z',
    end_at: '2026-07-10T18:00:00.000Z',
    status: 'reserved',
    ...overrides,
  }
}

describe('operational-state', () => {
  it('currently parked requires checked_in only', () => {
    expect(isCurrentlyParked(booking({ status: 'checked_in' }))).toBe(true)
    expect(isCurrentlyParked(booking({ status: 'reserved' }))).toBe(false)
    expect(isCurrentlyParked(booking({ status: 'checked_out' }))).toBe(false)
  })

  it('excludes cancelled and no_show from demand', () => {
    expect(countsTowardDemand(booking({ status: 'reserved' }))).toBe(true)
    expect(countsTowardDemand(booking({ status: 'cancelled' }))).toBe(false)
    expect(countsTowardDemand(booking({ status: 'no_show' }))).toBe(false)
  })

  it('arrival remaining is reserved only for today window', () => {
    const dayStart = new Date('2026-07-10T00:00:00.000Z')
    const dayEnd = new Date('2026-07-11T00:00:00.000Z')
    expect(isArrivalRemaining(booking({ status: 'reserved' }), dayStart, dayEnd)).toBe(true)
    expect(isArrivalRemaining(booking({ status: 'checked_in' }), dayStart, dayEnd)).toBe(false)
    expect(isArrivalRemaining(booking({ status: 'no_show' }), dayStart, dayEnd)).toBe(false)
  })

  it('departure remaining is checked_in only for today window', () => {
    const dayStart = new Date('2026-07-10T00:00:00.000Z')
    const dayEnd = new Date('2026-07-11T00:00:00.000Z')
    expect(isDepartureRemaining(booking({ status: 'checked_in' }), dayStart, dayEnd)).toBe(true)
    expect(isDepartureRemaining(booking({ status: 'reserved' }), dayStart, dayEnd)).toBe(false)
  })

  it('departure flight prefers return_flight_number', () => {
    expect(getDepartureFlight({ return_flight_number: 'BA200', flight_number: 'BA100' })).toBe('BA200')
    expect(getDepartureFlight({ flight_number: 'BA100' })).toBe('BA100')
    expect(getDepartureFlight({})).toBeNull()
  })

  it('kpis shift when status changes', () => {
    const rows = [
      booking({ id: 'a', status: 'reserved' }),
      booking({ id: 'b', status: 'checked_in' }),
    ]
    const initial = computeOperationalKpis(rows, tz, 100, new Date('2026-07-10T12:00:00.000Z'))
    expect(initial.arrivalsRemaining).toBe(1)
    expect(initial.currentlyParked).toBe(1)

    const afterArrive = computeOperationalKpis(
      [
        booking({ id: 'a', status: 'checked_in' }),
        booking({ id: 'b', status: 'checked_in' }),
      ],
      tz,
      100,
      new Date('2026-07-10T12:00:00.000Z')
    )
    expect(afterArrive.arrivalsRemaining).toBe(0)
    expect(afterArrive.currentlyParked).toBe(2)

    const afterDepart = computeOperationalKpis(
      [booking({ id: 'a', status: 'checked_out' }), booking({ id: 'b', status: 'checked_in' })],
      tz,
      100,
      new Date('2026-07-10T12:00:00.000Z')
    )
    expect(afterDepart.departuresRemaining).toBe(1)
    expect(afterDepart.currentlyParked).toBe(1)
  })

  it('excluded statuses are ignored in operations', () => {
    expect(isExcludedFromOperations('cancelled')).toBe(true)
    expect(isExcludedFromOperations('no_show')).toBe(true)
    expect(isExcludedFromOperations('reserved')).toBe(false)
  })
})
