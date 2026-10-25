import { describe, it, expect } from 'vitest';
import { parseMoney } from '../parseMoney';

describe('parseMoney', () => {
  it.each([
    ['£12.50', 12.5],
    ['12.50', 12.5],
    [' £ 1,234.00 ', 1234],
    ['GBP 45', 45],
    ['45.00 GBP', 45],
    ['&pound;1,045.50', 1045.5],
    ['Â£108.10', 108.1],
    ['12,50', 12.5],
    ['1.234,50', 1234.5],
    ['1,234', 1234],
    ['0', 0],
    ['£0.00', 0],
    ['-5.00', -5],
    ['(5.00)', -5],
    [12.345, 12.35],
    [0, 0],
  ])('parses %s', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each([null, undefined, '', '   ', 'N/A', 'free', '£', NaN])('returns null for %s', (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});
