import { tenantDateKeyFromUtc } from '@/lib/datetime/parse';
import { enumerateDateKeys } from '@/lib/analytics/demandOccupancy';

type HasStayDates = { start_at: string; end_at: string };

/** Date key for Today board grouping — matches naive UTC calendar-day queries. */
function todayBoardDateKey(timestamp: string | null | undefined, timezone: string): string {
  if (!timestamp) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(timestamp)) {
    return timestamp.slice(0, 10);
  }
  return tenantDateKeyFromUtc(timestamp, timezone);
}

/**
 * Group bookings by each tenant-local day they overlap within [from, to].
 * O(bookings × stay length) instead of O(days × bookings).
 */
export function groupOverlappingBookingsByDay<T extends HasStayDates>(
  bookings: T[],
  from: string,
  to: string,
  timezone: string
): Array<{ date: string; bookings: T[]; displayDate: string }> {
  if (bookings.length === 0) return [];

  const rangeDays = new Set(enumerateDateKeys(from, to));
  const grouped = new Map<string, T[]>();

  for (const booking of bookings) {
    const startDay = tenantDateKeyFromUtc(booking.start_at, timezone);
    const endDay = tenantDateKeyFromUtc(booking.end_at, timezone);
    if (!startDay || !endDay) continue;

    const stayDays = enumerateDateKeys(
      startDay < from ? from : startDay,
      endDay > to ? to : endDay
    );

    for (const day of stayDays) {
      if (!rangeDays.has(day)) continue;
      const list = grouped.get(day);
      if (list) list.push(booking);
      else grouped.set(day, [booking]);
    }
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayBookings]) => ({
      date,
      bookings: dayBookings,
      displayDate: formatDisplayDate(date),
    }));
}

export function groupBookingsByFieldDay<T extends HasStayDates>(
  bookings: T[],
  dateField: 'start_at' | 'end_at',
  timezone: string
): Array<{ date: string; bookings: T[]; displayDate: string }> {
  const grouped = new Map<string, T[]>();

  for (const booking of bookings) {
    const dateKey = tenantDateKeyFromUtc(booking[dateField], timezone);
    if (!dateKey) continue;
    const list = grouped.get(dateKey);
    if (list) list.push(booking);
    else grouped.set(dateKey, [booking]);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayBookings]) => ({
      date,
      bookings: dayBookings,
      displayDate: formatDisplayDate(date),
    }));
}

export function groupArrivalsAndDeparturesByDay<T extends HasStayDates & { id: string }>(
  arrivals: T[],
  departures: T[],
  timezone: string
): Array<{
  date: string;
  displayDate: string;
  arrivals: T[];
  departures: T[];
}> {
  const arrivalsByDay = new Map<string, T[]>();
  const departuresByDay = new Map<string, T[]>();
  const allDates = new Set<string>();

  for (const b of arrivals) {
    const key = todayBoardDateKey(b.start_at, timezone);
    if (!key) continue;
    allDates.add(key);
    const list = arrivalsByDay.get(key);
    if (list) list.push(b);
    else arrivalsByDay.set(key, [b]);
  }

  for (const b of departures) {
    const key = todayBoardDateKey(b.end_at, timezone);
    if (!key) continue;
    allDates.add(key);
    const list = departuresByDay.get(key);
    if (list) list.push(b);
    else departuresByDay.set(key, [b]);
  }

  return Array.from(allDates)
    .sort()
    .map((date) => ({
      date,
      displayDate: formatDisplayDate(date),
      arrivals: arrivalsByDay.get(date) ?? [],
      departures: departuresByDay.get(date) ?? [],
    }));
}

function formatDisplayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
