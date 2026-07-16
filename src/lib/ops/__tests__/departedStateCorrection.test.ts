import { describe, expect, it } from 'vitest';
import { isAuthoritativeOnSite, resolveCurrentOccupancyPure } from '@/lib/analytics/occupancyTimeseries';
import { isCurrentlyParked } from '@/lib/ops/parkedState';
import {
  booking41140ParkedAfterCorrectionFixture,
  booking41140StaleOnSiteFixture,
  buildDepartedStateConsistencyPatch,
  needsDepartedStateConsistencyCorrection,
} from '@/lib/ops/departedStateCorrection';

describe('departed state consistency correction', () => {
  it('detects stale on-site fields when departure timestamp exists', () => {
    expect(needsDepartedStateConsistencyCorrection(booking41140StaleOnSiteFixture())).toBe(true);
    expect(needsDepartedStateConsistencyCorrection(booking41140ParkedAfterCorrectionFixture())).toBe(
      false
    );
  });

  it('builds patch without changing arrival or departure timestamps', () => {
    const stale = booking41140StaleOnSiteFixture();
    const patch = buildDepartedStateConsistencyPatch(stale, '2026-07-16T18:00:00.000Z', null);
    expect(patch.status).toBe('checked_out');
    expect(patch.gate_status).toBe('departed');
    expect(patch.anpr_status).toBe('departed');
    expect(patch.ops_hidden).toBe(true);
    expect(patch.ops_hidden_reason).toBe('departed');
    expect(patch.checked_out_at).toBe(stale.departed_at);
    expect(patch).not.toHaveProperty('arrived_at');
    expect(patch).not.toHaveProperty('departed_at');
    expect(patch).not.toHaveProperty('checked_in_at');
  });

  it('booking 41140 no longer counts as currently parked after correction', () => {
    const corrected = booking41140ParkedAfterCorrectionFixture();
    expect(isCurrentlyParked(corrected)).toBe(false);
    expect(
      isAuthoritativeOnSite({
        ...corrected,
        start_at: '2026-07-02T00:00:00Z',
        end_at: '2026-07-16T23:00:00Z',
      })
    ).toBe(false);

    // Stale pre-correction shape is also excluded once departure timestamp is present
    const stale = booking41140StaleOnSiteFixture();
    expect(isCurrentlyParked(stale)).toBe(false);
  });

  it('all current occupancy consumers return the same result for 41140', () => {
    const corrected = {
      ...booking41140ParkedAfterCorrectionFixture(),
      id: '47ca514f-ed3e-46f7-9a7e-df40aa841127',
      start_at: '2026-07-02T00:00:00Z',
      end_at: '2026-07-16T23:00:00Z',
    };
    const parked = isCurrentlyParked(corrected);
    const authoritative = isAuthoritativeOnSite(corrected);
    const resolved = resolveCurrentOccupancyPure({
      bookings: [corrected],
      snapshots: [],
      events: [],
      reliableFrom: null,
    });
    expect(parked).toBe(false);
    expect(authoritative).toBe(false);
    expect(resolved.occupiedCount).toBe(0);
    expect(resolved.mode).toBe('fallback_booking_state');
  });

  it('correction is idempotent when already consistent', () => {
    const corrected = booking41140ParkedAfterCorrectionFixture();
    expect(needsDepartedStateConsistencyCorrection(corrected)).toBe(false);
    // Second evaluation stays false
    expect(needsDepartedStateConsistencyCorrection(corrected)).toBe(false);
  });
});
