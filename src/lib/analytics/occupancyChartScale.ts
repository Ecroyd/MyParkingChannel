/**
 * Y-axis domain helpers for the occupancy chart.
 * Full scale always starts at 0; focused scale zooms to visible non-null values.
 */

export type OccupancyScaleMode = 'full' | 'focused';

export type OccupancyScalePoint = {
  expected: number;
  actual: number | null;
  capacity: number | null;
};

const STORAGE_KEY = 'occupancy-chart-y-scale-mode';

/** Pick a whole-number tick increment (5 / 10 / 20 / 25 / …). */
export function usefulIncrementFor(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= 40) return 5;
  if (magnitude <= 150) return 10;
  if (magnitude <= 300) return 20;
  if (magnitude <= 600) return 25;
  if (magnitude <= 1200) return 50;
  return 100;
}

export function ceilToUsefulIncrement(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 5;
  const step = usefulIncrementFor(value);
  return Math.ceil(value / step) * step;
}

export function floorToUsefulIncrement(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const step = usefulIncrementFor(value);
  return Math.floor(value / step) * step;
}

/** Collect visible non-null series values (Expected, Actual, Capacity). */
export function collectVisibleScaleValues(points: OccupancyScalePoint[]): number[] {
  const values: number[] = [];
  for (const p of points) {
    if (Number.isFinite(p.expected)) values.push(p.expected);
    if (p.actual != null && Number.isFinite(p.actual)) values.push(p.actual);
    if (p.capacity != null && Number.isFinite(p.capacity)) values.push(p.capacity);
  }
  return values;
}

export function computeFullYDomain(points: OccupancyScalePoint[]): [number, number] {
  const values = collectVisibleScaleValues(points);
  const peak = values.length > 0 ? Math.max(...values) : 0;
  const max = ceilToUsefulIncrement(peak * 1.1);
  return [0, Math.max(max, 5)];
}

/**
 * Focused domain from visible non-null Expected / Actual / Capacity.
 * Null Actual (pre-baseline) is excluded via collectVisibleScaleValues.
 */
export function computeFocusedYDomain(points: OccupancyScalePoint[]): [number, number] {
  const values = collectVisibleScaleValues(points);
  if (values.length === 0) return [0, 10];

  const visibleMin = Math.min(...values);
  const visibleMax = Math.max(...values);
  const range = Math.max(visibleMax - visibleMin, 10);
  const padding = Math.max(5, Math.ceil(range * 0.15));

  let focusedMin = Math.max(0, floorToUsefulIncrement(visibleMin - padding));
  let focusedMax = ceilToUsefulIncrement(visibleMax + padding);

  if (focusedMin >= focusedMax) {
    focusedMax = ceilToUsefulIncrement(focusedMin + 10);
  }
  if (focusedMin >= focusedMax) {
    focusedMin = Math.max(0, focusedMax - 10);
  }

  return [focusedMin, focusedMax];
}

export function computeOccupancyYDomain(
  mode: OccupancyScaleMode,
  points: OccupancyScalePoint[]
): [number, number] {
  return mode === 'focused' ? computeFocusedYDomain(points) : computeFullYDomain(points);
}

export function readStoredOccupancyScaleMode(): OccupancyScaleMode {
  if (typeof window === 'undefined') return 'full';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'focused' ? 'focused' : 'full';
  } catch {
    return 'full';
  }
}

export function writeStoredOccupancyScaleMode(mode: OccupancyScaleMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore quota / private mode
  }
}
