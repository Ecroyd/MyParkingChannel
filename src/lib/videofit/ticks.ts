// Videofit .NET ticks conversion
// .NET ticks = (JavaScript milliseconds + 62135596800000) * 10000
// 62135596800000 = milliseconds between 1970-01-01 and 0001-01-01

/**
 * Convert JavaScript Date to Videofit .NET ticks (as string)
 * Ticks = (milliseconds since 1970-01-01 + offset to 0001-01-01) * 10000
 */
export function toVideofitTicks(date: Date): string {
  const ticks = (date.getTime() + 62135596800000) * 10000;
  return ticks.toString();
}
