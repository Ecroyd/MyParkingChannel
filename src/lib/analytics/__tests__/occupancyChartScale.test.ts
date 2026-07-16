import { describe, expect, it } from 'vitest';
import {
  ceilToUsefulIncrement,
  collectVisibleScaleValues,
  computeFocusedYDomain,
  computeFullYDomain,
  computeOccupancyYDomain,
  floorToUsefulIncrement,
  type OccupancyScalePoint,
} from '../occupancyChartScale';

const samplePoints: OccupancyScalePoint[] = [
  { expected: 110, actual: null, capacity: 250 },
  { expected: 120, actual: 108, capacity: 250 },
  { expected: 125, actual: 132, capacity: 250 },
  { expected: 118, actual: 130, capacity: 250 },
];

describe('occupancyChartScale', () => {
  it('full scale begins at zero and pads peak by ~10%', () => {
    const [min, max] = computeFullYDomain(samplePoints);
    expect(min).toBe(0);
    // peak visible = 250 (capacity); 250 * 1.1 = 275 → ceil useful
    expect(max).toBe(ceilToUsefulIncrement(250 * 1.1));
    expect(max).toBeGreaterThanOrEqual(250);
  });

  it('focused scale uses visible non-null values (example ~108–132 → ~100–140)', () => {
    const withoutCapacity: OccupancyScalePoint[] = [
      { expected: 110, actual: null, capacity: null },
      { expected: 120, actual: 108, capacity: null },
      { expected: 125, actual: 132, capacity: null },
      { expected: 118, actual: 130, capacity: null },
    ];
    const [min, max] = computeFocusedYDomain(withoutCapacity);
    expect(min).toBeLessThanOrEqual(108);
    expect(max).toBeGreaterThanOrEqual(132);
    expect(min).toBe(100);
    expect(max).toBe(140);
  });

  it('null Actual history does not affect the domain', () => {
    const withNulls: OccupancyScalePoint[] = [
      { expected: 50, actual: null, capacity: null },
      { expected: 55, actual: null, capacity: null },
      { expected: 60, actual: 58, capacity: null },
    ];
    const values = collectVisibleScaleValues(withNulls);
    expect(values).not.toContain(null);
    expect(values).toEqual(expect.arrayContaining([50, 55, 60, 58]));
    expect(values).toHaveLength(4);
    const [min, max] = computeFocusedYDomain(withNulls);
    expect(min).toBeLessThanOrEqual(50);
    expect(max).toBeGreaterThanOrEqual(60);
  });

  it('capacity is included in the domain', () => {
    const points: OccupancyScalePoint[] = [
      { expected: 10, actual: 12, capacity: 100 },
    ];
    expect(collectVisibleScaleValues(points)).toContain(100);
    const [fullMin, fullMax] = computeFullYDomain(points);
    expect(fullMin).toBe(0);
    expect(fullMax).toBeGreaterThanOrEqual(100);
    const [fMin, fMax] = computeFocusedYDomain(points);
    expect(fMax).toBeGreaterThanOrEqual(100);
    expect(fMin).toBeLessThanOrEqual(10);
  });

  it('a flat series still receives usable padding', () => {
    const flat: OccupancyScalePoint[] = [
      { expected: 80, actual: 80, capacity: null },
      { expected: 80, actual: 80, capacity: null },
    ];
    const [min, max] = computeFocusedYDomain(flat);
    expect(max - min).toBeGreaterThanOrEqual(10);
    expect(min).toBeLessThan(80);
    expect(max).toBeGreaterThan(80);
  });

  it('switching date range recalculates the scale', () => {
    const dayA: OccupancyScalePoint[] = [
      { expected: 20, actual: 22, capacity: 100 },
      { expected: 25, actual: 24, capacity: 100 },
    ];
    const dayB: OccupancyScalePoint[] = [
      { expected: 108, actual: 110, capacity: 250 },
      { expected: 132, actual: 130, capacity: 250 },
    ];
    const a = computeFocusedYDomain(dayA);
    const b = computeFocusedYDomain(dayB);
    expect(a).not.toEqual(b);
    expect(b[1]).toBeGreaterThan(a[1]);
  });

  it('changing scale does not change chart data', () => {
    const data = samplePoints.map((p) => ({ ...p }));
    const full = computeOccupancyYDomain('full', data);
    const focused = computeOccupancyYDomain('focused', data);
    expect(full).not.toEqual(focused);
    expect(data).toEqual(samplePoints);
  });

  it('ceil/floor useful increments use whole vehicle steps', () => {
    expect(ceilToUsefulIncrement(108)).toBe(110);
    expect(floorToUsefulIncrement(108)).toBe(100);
    expect(ceilToUsefulIncrement(132)).toBe(140);
  });
});
