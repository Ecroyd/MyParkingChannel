import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BookingListRequestController,
  SEARCH_DEBOUNCE_MS,
  canPollBookingList,
  debounceLeadingTrailing,
  shouldRefreshOnVisibility,
  buildAdminBookingsListUrl,
} from '@/lib/bookings/adminBookingListClient';

describe('canPollBookingList', () => {
  it('does not poll while the tab is hidden', () => {
    expect(
      canPollBookingList({
        visibilityState: 'hidden',
        online: true,
        isEditing: false,
        inFlight: false,
      })
    ).toBe(false);
  });

  it('does not poll while offline, editing, or in-flight', () => {
    expect(
      canPollBookingList({
        visibilityState: 'visible',
        online: false,
        isEditing: false,
        inFlight: false,
      })
    ).toBe(false);
    expect(
      canPollBookingList({
        visibilityState: 'visible',
        online: true,
        isEditing: true,
        inFlight: false,
      })
    ).toBe(false);
    expect(
      canPollBookingList({
        visibilityState: 'visible',
        online: true,
        isEditing: false,
        inFlight: true,
      })
    ).toBe(false);
  });

  it('allows poll when visible, online, not editing, not in-flight', () => {
    expect(
      canPollBookingList({
        visibilityState: 'visible',
        online: true,
        isEditing: false,
        inFlight: false,
      })
    ).toBe(true);
  });
});

describe('BookingListRequestController', () => {
  it('prevents overlapping requests by aborting the previous one', async () => {
    const controller = new BookingListRequestController();
    let firstAborted = false;

    const first = controller.run(async (signal) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 100);
        signal.addEventListener('abort', () => {
          firstAborted = true;
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return 'first';
    });

    const second = controller.run(async () => 'second');

    const [a, b] = await Promise.all([first, second]);
    expect(firstAborted).toBe(true);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(['aborted', 'stale']).toContain(a.reason);
    expect(b).toEqual({ ok: true, data: 'second', sequence: 2 });
  });

  it('ignores stale responses so they cannot overwrite newer results', async () => {
    const controller = new BookingListRequestController();

    let releaseSlow = () => {};
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });

    const slow = controller.run(async () => {
      await slowGate;
      return 'slow';
    });

    const fast = controller.run(async () => 'fast');
    const fastResult = await fast;
    expect(fastResult).toEqual({ ok: true, data: 'fast', sequence: 2 });

    releaseSlow();
    const slowResult = await slow;
    expect(slowResult.ok).toBe(false);
    if (!slowResult.ok) {
      expect(['stale', 'aborted']).toContain(slowResult.reason);
    }
  });

  it('records a single refresh for bulk actions', () => {
    const controller = new BookingListRequestController();
    controller.resetRefreshCount();
    // bulk completes then one refresh
    controller.noteRefreshRequested();
    expect(controller.bulkRefreshCount).toBe(1);
  });
});

describe('search debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces free-text search by approximately 300ms', () => {
    const spy = vi.fn();
    const debounced = debounceLeadingTrailing(spy, SEARCH_DEBOUNCE_MS);
    expect(SEARCH_DEBOUNCE_MS).toBe(300);

    debounced('a');
    debounced('ab');
    debounced('abc');
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('abc');
  });
});

describe('visibility freshness', () => {
  it('refreshes when becoming visible if data is older than 60 seconds', () => {
    expect(shouldRefreshOnVisibility(0, 61_000)).toBe(true);
    expect(shouldRefreshOnVisibility(0, 30_000)).toBe(false);
  });
});

describe('buildAdminBookingsListUrl', () => {
  it('preserves filters and pagination in the request URL', () => {
    const url = buildAdminBookingsListUrl('tenant-1', {
      page: 2,
      pageSize: 50,
      search: 'plate',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      status: 'reserved',
      source: 'cavu',
      sort: 'start_at:asc',
      includeCancelled: false,
      includeFinished: true,
    });
    expect(url).toContain('tenantId=tenant-1');
    expect(url).toContain('page=2');
    expect(url).toContain('pageSize=50');
    expect(url).toContain('search=plate');
    expect(url).toContain('dateFrom=2026-01-01');
    expect(url).toContain('dateTo=2026-12-31');
    expect(url).toContain('status=reserved');
    expect(url).toContain('source=cavu');
    expect(url).toContain('sort=start_at%3Aasc');
  });
});
