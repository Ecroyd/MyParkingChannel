import { tenantTodayDateKey } from '@/lib/timezone';

export const ALLOWED_PAGE_SIZES = [25, 50, 100] as const;
export type AllowedPageSize = (typeof ALLOWED_PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: AllowedPageSize = 50;
export const MAX_PAGE_SIZE = 100;

export const DEFAULT_DATE_LOOKBACK_DAYS = 30;
export const DEFAULT_DATE_LOOKAHEAD_DAYS = 180;

export const ALLOWED_SORT_FIELDS = [
  'start_at',
  'end_at',
  'created_at',
  'updated_at',
  'reference',
] as const;
export type AllowedSortField = (typeof ALLOWED_SORT_FIELDS)[number];
export type SortDirection = 'asc' | 'desc';

export type AdminBookingListQueryParams = {
  tenantId: string;
  page: number;
  pageSize: AllowedPageSize;
  search: string;
  /** YYYY-MM-DD inclusive; null = no bound */
  dateFrom: string | null;
  /** YYYY-MM-DD inclusive; null = no bound */
  dateTo: string | null;
  status: string | null;
  source: string | null;
  sortField: AllowedSortField;
  sortDirection: SortDirection;
  includeCancelled: boolean;
  includeFinished: boolean;
  /** Whether default date window was applied because params omitted both dates */
  usedDefaultDateWindow: boolean;
};

export type AdminBookingListResponse = {
  rows: import('./adminBookingListSelect').BookingAdminListRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  refreshedAt: string;
  dateFrom: string | null;
  dateTo: string | null;
  usedDefaultDateWindow: boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function addCalendarDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export function getDefaultAdminBookingDateWindow(
  timezone: string = 'Europe/London',
  now: Date = new Date()
): { dateFrom: string; dateTo: string } {
  const today = tenantTodayDateKey(timezone, now);
  return {
    dateFrom: addCalendarDays(today, -DEFAULT_DATE_LOOKBACK_DAYS),
    dateTo: addCalendarDays(today, DEFAULT_DATE_LOOKAHEAD_DAYS),
  };
}

/** Hard-enforce allowed page sizes; never above MAX_PAGE_SIZE (100). */
export function enforceMaxPageSize(raw: unknown): AllowedPageSize {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  const floored = Math.floor(n);
  if (floored > MAX_PAGE_SIZE) return MAX_PAGE_SIZE as AllowedPageSize;
  if (ALLOWED_PAGE_SIZES.includes(floored as AllowedPageSize)) {
    return floored as AllowedPageSize;
  }
  // Snap down to nearest allowed size
  const allowed = [...ALLOWED_PAGE_SIZES].reverse().find((s) => s <= floored);
  return allowed ?? DEFAULT_PAGE_SIZE;
}

/** @deprecated use enforceMaxPageSize */
export function clampPageSize(raw: unknown): AllowedPageSize {
  return enforceMaxPageSize(raw);
}

export function parseSortParam(
  sort: string | null | undefined
): { sortField: AllowedSortField; sortDirection: SortDirection } {
  if (!sort) {
    return { sortField: 'start_at', sortDirection: 'asc' };
  }
  const [fieldRaw, dirRaw] = sort.split(':');
  const sortField = (ALLOWED_SORT_FIELDS as readonly string[]).includes(fieldRaw)
    ? (fieldRaw as AllowedSortField)
    : 'start_at';
  const sortDirection: SortDirection = dirRaw === 'desc' ? 'desc' : 'asc';
  return { sortField, sortDirection };
}

export function formatSortParam(field: AllowedSortField, direction: SortDirection): string {
  return `${field}:${direction}`;
}

function parseOptionalDate(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!DATE_RE.test(trimmed)) return null;
  return trimmed;
}

export type RawAdminBookingListParams = {
  tenantId: string;
  page?: string | number | null;
  pageSize?: string | number | null;
  search?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  status?: string | null;
  source?: string | null;
  sort?: string | null;
  sortField?: string | null;
  sortDirection?: string | null;
  includeCancelled?: string | boolean | null;
  includeFinished?: string | boolean | null;
  /** When true and both dates omitted, leave dates null (explicit clear). */
  datesCleared?: string | boolean | null;
  timezone?: string | null;
};

function toBool(value: string | boolean | null | undefined, defaultValue: boolean): boolean {
  if (value == null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const v = value.toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return defaultValue;
}

/**
 * Resolve list params. Default operational date window applies when both
 * dateFrom and dateTo are omitted (and dates were not explicitly cleared).
 */
export function resolveAdminBookingListParams(
  raw: RawAdminBookingListParams
): AdminBookingListQueryParams {
  const timezone = raw.timezone || 'Europe/London';
  const page = Math.max(1, Math.floor(Number(raw.page) || 1));
  const pageSize = enforceMaxPageSize(raw.pageSize ?? DEFAULT_PAGE_SIZE);

  let dateFrom = parseOptionalDate(raw.dateFrom ?? null);
  let dateTo = parseOptionalDate(raw.dateTo ?? null);
  const datesCleared = toBool(raw.datesCleared, false);
  let usedDefaultDateWindow = false;

  const bothOmitted =
    (raw.dateFrom == null || String(raw.dateFrom).trim() === '') &&
    (raw.dateTo == null || String(raw.dateTo).trim() === '');

  if (bothOmitted && !datesCleared) {
    const window = getDefaultAdminBookingDateWindow(timezone);
    dateFrom = window.dateFrom;
    dateTo = window.dateTo;
    usedDefaultDateWindow = true;
  }

  const { sortField, sortDirection } =
    raw.sortField || raw.sortDirection
      ? {
          sortField: (ALLOWED_SORT_FIELDS as readonly string[]).includes(String(raw.sortField))
            ? (raw.sortField as AllowedSortField)
            : parseSortParam(raw.sort).sortField,
          sortDirection: (raw.sortDirection === 'desc' ? 'desc' : 'asc') as SortDirection,
        }
      : parseSortParam(raw.sort);

  const status = raw.status?.trim() ? raw.status.trim() : null;
  const source = raw.source?.trim() && raw.source.trim() !== 'all' ? raw.source.trim() : null;

  return {
    tenantId: raw.tenantId,
    page,
    pageSize,
    search: (raw.search ?? '').trim(),
    dateFrom,
    dateTo,
    status,
    source,
    sortField,
    sortDirection,
    includeCancelled: toBool(raw.includeCancelled, false),
    includeFinished: toBool(raw.includeFinished, true),
    usedDefaultDateWindow,
  };
}

/** Escape a value for use inside a PostgREST `or=(...)` filter. */
export function escapePostgrestFilterValue(value: string): string {
  return value.replace(/[,()]/g, '').replace(/%/g, '');
}
