import { describe, it, expect } from 'vitest';
import { enumerateDateKeys, aggregateDemandByDay } from '../demandOccupancy';
import type { DemandBookingRow } from '../demandOccupancy';

describe('Demand Curve 90-Day Range', () => {
  it('should generate exactly 90 dates for 90-day range', () => {
    const from = '2026-07-20';
    const to = '2026-10-17'; // 20 Jul + 89 days = 17 Oct (90 days inclusive)
    
    const keys = enumerateDateKeys(from, to);
    expect(keys).toHaveLength(90);
    expect(keys[0]).toBe(from);
    expect(keys[keys.length - 1]).toBe(to);
  });

  it('should include October dates when 90-day range spans into October', () => {
    const from = '2026-07-20';
    const to = '2026-10-17';
    
    const keys = enumerateDateKeys(from, to);
    const octoberDates = keys.filter((k) => k.startsWith('2026-10'));
    
    expect(octoberDates.length).toBeGreaterThan(0);
    expect(octoberDates).toContain('2026-10-01');
    expect(octoberDates).toContain('2026-10-17');
  });

  it('should generate same result for preset and custom range', () => {
    const from = '2026-07-20';
    const preset90DayTo = '2026-10-17'; // from + 89 days
    const customTo = '2026-10-17';
    
    const presetKeys = enumerateDateKeys(from, preset90DayTo);
    const customKeys = enumerateDateKeys(from, customTo);
    
    expect(presetKeys).toEqual(customKeys);
  });

  it('should handle booking spanning into October', () => {
    const bookings: DemandBookingRow[] = [
      {
        reference: 'OCT001',
        start_at: '2026-10-01T10:00:00Z',
        end_at: '2026-10-05T15:00:00Z',
        status: 'reserved',
        gate_status: 'reserved',
      },
    ];

    const dayKeys = enumerateDateKeys('2026-10-01', '2026-10-05');
    const metrics = aggregateDemandByDay({ bookings, dayKeys });

    expect(metrics).toHaveLength(5);
    expect(metrics.every((m) => m.bookedDemand === 1)).toBe(true);
  });

  it('should include booking that starts before range but ends inside', () => {
    const bookings: DemandBookingRow[] = [
      {
        reference: 'SPAN001',
        start_at: '2026-09-28T10:00:00Z',
        end_at: '2026-10-03T15:00:00Z',
        status: 'reserved',
        gate_status: 'reserved',
      },
    ];

    const dayKeys = enumerateDateKeys('2026-10-01', '2026-10-05');
    const metrics = aggregateDemandByDay({ bookings, dayKeys });

    // Should count on Oct 1, 2, 3 but not 4, 5
    expect(metrics[0].bookedDemand).toBe(1); // Oct 1
    expect(metrics[1].bookedDemand).toBe(1); // Oct 2
    expect(metrics[2].bookedDemand).toBe(1); // Oct 3
    expect(metrics[3].bookedDemand).toBe(0); // Oct 4
    expect(metrics[4].bookedDemand).toBe(0); // Oct 5
  });

  it('should include booking that starts inside range but ends after', () => {
    const bookings: DemandBookingRow[] = [
      {
        reference: 'SPAN002',
        start_at: '2026-10-03T10:00:00Z',
        end_at: '2026-10-08T15:00:00Z',
        status: 'reserved',
        gate_status: 'reserved',
      },
    ];

    const dayKeys = enumerateDateKeys('2026-10-01', '2026-10-05');
    const metrics = aggregateDemandByDay({ bookings, dayKeys });

    // Should count on Oct 3, 4, 5
    expect(metrics[0].bookedDemand).toBe(0); // Oct 1
    expect(metrics[1].bookedDemand).toBe(0); // Oct 2
    expect(metrics[2].bookedDemand).toBe(1); // Oct 3
    expect(metrics[3].bookedDemand).toBe(1); // Oct 4
    expect(metrics[4].bookedDemand).toBe(1); // Oct 5
  });

  it('should exclude cancelled bookings', () => {
    const bookings: DemandBookingRow[] = [
      {
        reference: 'CANC001',
        start_at: '2026-10-01T10:00:00Z',
        end_at: '2026-10-05T15:00:00Z',
        status: 'cancelled',
        gate_status: 'cancelled',
      },
    ];

    const dayKeys = enumerateDateKeys('2026-10-01', '2026-10-05');
    const metrics = aggregateDemandByDay({ bookings, dayKeys });

    expect(metrics.every((m) => m.bookedDemand === 0)).toBe(true);
  });

  it('should exclude no-show bookings', () => {
    const bookings: DemandBookingRow[] = [
      {
        reference: 'NOSHOW001',
        start_at: '2026-10-01T10:00:00Z',
        end_at: '2026-10-05T15:00:00Z',
        status: 'reserved',
        gate_status: 'no_show',
      },
    ];

    const dayKeys = enumerateDateKeys('2026-10-01', '2026-10-05');
    const metrics = aggregateDemandByDay({ bookings, dayKeys });

    expect(metrics.every((m) => m.bookedDemand === 0)).toBe(true);
  });

  it('should handle DST transition without losing dates', () => {
    // UK DST ends on last Sunday of October (26 Oct 2026)
    const from = '2026-10-24';
    const to = '2026-10-28';
    
    const keys = enumerateDateKeys(from, to);
    
    expect(keys).toHaveLength(5);
    expect(keys).toEqual([
      '2026-10-24',
      '2026-10-25',
      '2026-10-26', // DST ends
      '2026-10-27',
      '2026-10-28',
    ]);
  });

  it('should generate zero-value days when no bookings', () => {
    const bookings: DemandBookingRow[] = [];
    const dayKeys = enumerateDateKeys('2026-10-01', '2026-10-05');
    const metrics = aggregateDemandByDay({ bookings, dayKeys });

    expect(metrics).toHaveLength(5);
    expect(metrics.every((m) => m.bookedDemand === 0)).toBe(true);
    expect(metrics.every((m) => m.arrivals === 0)).toBe(true);
    expect(metrics.every((m) => m.departures === 0)).toBe(true);
  });

  it('should count arrivals and departures correctly', () => {
    const bookings: DemandBookingRow[] = [
      {
        reference: 'ARR001',
        start_at: '2026-10-03T10:00:00Z',
        end_at: '2026-10-05T15:00:00Z',
        status: 'reserved',
        gate_status: 'reserved',
      },
    ];

    const dayKeys = enumerateDateKeys('2026-10-01', '2026-10-05');
    const metrics = aggregateDemandByDay({ bookings, dayKeys, timezone: 'Europe/London' });

    // Arrival on Oct 3, departure on Oct 5 (UK time)
    const oct3 = metrics.find((m) => m.date === '2026-10-03');
    const oct5 = metrics.find((m) => m.date === '2026-10-05');
    
    expect(oct3?.arrivals).toBe(1);
    expect(oct5?.departures).toBe(1);
  });
});
