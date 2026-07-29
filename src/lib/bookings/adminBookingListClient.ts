/**
 * Client-side helpers for admin booking list fetch orchestration.
 * Pure / testable — no React dependency.
 */

export const SEARCH_DEBOUNCE_MS = 300;
export const STALE_AFTER_MS = 60_000;
export const VISIBLE_POLL_INTERVAL_MS = 60_000;

export type BookingListFetchGate = {
  visibilityState: DocumentVisibilityState | 'hidden' | 'visible';
  online: boolean;
  isEditing: boolean;
  inFlight: boolean;
};

export function canPollBookingList(gate: BookingListFetchGate): boolean {
  if (gate.visibilityState === 'hidden') return false;
  if (!gate.online) return false;
  if (gate.isEditing) return false;
  if (gate.inFlight) return false;
  return true;
}

export function shouldRefreshOnVisibility(
  lastRefreshedAtMs: number | null,
  nowMs: number,
  staleAfterMs: number = STALE_AFTER_MS
): boolean {
  if (lastRefreshedAtMs == null) return true;
  return nowMs - lastRefreshedAtMs >= staleAfterMs;
}

export function formatBookingListFreshness(
  refreshedAtMs: number | null,
  nowMs: number,
  refreshing: boolean
): string {
  if (refreshing) return 'Refreshing…';
  if (refreshedAtMs == null) return '';
  const sec = Math.max(0, Math.floor((nowMs - refreshedAtMs) / 1000));
  if (sec < 10) return 'Updated just now';
  if (sec < 60) return `Updated ${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min === 1) return 'Updated 1 minute ago';
  if (min < 60) return `Updated ${min} minutes ago`;
  return 'Updated over an hour ago';
}

/**
 * Tracks in-flight booking-list requests, abort, and stale response rejection.
 */
export class BookingListRequestController {
  private abortController: AbortController | null = null;
  private sequence = 0;
  private _inFlight = false;
  private refreshCount = 0;

  get inFlight(): boolean {
    return this._inFlight;
  }

  get bulkRefreshCount(): number {
    return this.refreshCount;
  }

  /** Record that a refresh was requested (for bulk-action "one refresh" tests). */
  noteRefreshRequested(): void {
    this.refreshCount += 1;
  }

  resetRefreshCount(): void {
    this.refreshCount = 0;
  }

  abortInFlight(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this._inFlight = false;
  }

  /**
   * Start a fetch. Aborts any previous in-flight request.
   * Returns null if a stale response should be ignored, or if aborted.
   */
  async run<T>(
    execute: (signal: AbortSignal) => Promise<T>
  ): Promise<{ ok: true; data: T; sequence: number } | { ok: false; reason: 'aborted' | 'stale' | 'in_flight' }> {
    // Never allow overlapping — cancel previous then start new
    this.abortInFlight();

    const controller = new AbortController();
    this.abortController = controller;
    const sequence = ++this.sequence;
    this._inFlight = true;

    try {
      const data = await execute(controller.signal);
      if (sequence !== this.sequence) {
        return { ok: false, reason: 'stale' };
      }
      if (controller.signal.aborted) {
        return { ok: false, reason: 'aborted' };
      }
      return { ok: true, data, sequence };
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return { ok: false, reason: 'aborted' };
      }
      throw err;
    } finally {
      if (this.abortController === controller) {
        this._inFlight = false;
        this.abortController = null;
      }
    }
  }
}

export function debounceLeadingTrailing<T extends (...args: never[]) => void>(
  fn: T,
  waitMs: number
): { (...args: Parameters<T>): void; cancel: () => void; flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestArgs: Parameters<T> | null = null;

  const wrapped = (...args: Parameters<T>) => {
    latestArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (latestArgs) {
        fn(...latestArgs);
        latestArgs = null;
      }
    }, waitMs);
  };

  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    latestArgs = null;
  };

  wrapped.flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (latestArgs) {
      fn(...latestArgs);
      latestArgs = null;
    }
  };

  return wrapped;
}

export function buildAdminBookingsListUrl(
  tenantId: string,
  params: {
    page: number;
    pageSize: number;
    search: string;
    dateFrom: string | null;
    dateTo: string | null;
    status: string | null;
    source: string | null;
    sort: string;
    includeCancelled: boolean;
    includeFinished: boolean;
    datesCleared?: boolean;
  }
): string {
  const qs = new URLSearchParams();
  qs.set('tenantId', tenantId);
  qs.set('page', String(params.page));
  qs.set('pageSize', String(params.pageSize));
  if (params.search) qs.set('search', params.search);
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params.dateTo) qs.set('dateTo', params.dateTo);
  if (params.datesCleared) qs.set('datesCleared', 'true');
  if (params.status) qs.set('status', params.status);
  if (params.source && params.source !== 'all') qs.set('source', params.source);
  qs.set('sort', params.sort);
  qs.set('includeCancelled', String(params.includeCancelled));
  qs.set('includeFinished', String(params.includeFinished));
  return `/api/admin/bookings/list?${qs.toString()}`;
}
