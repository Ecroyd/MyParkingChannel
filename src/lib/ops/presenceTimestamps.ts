/**
 * Shared helpers for setting operational arrival/departure timestamps.
 * Preserve first-set values; clear consistently on revert.
 */

export type TimestampFields = {
  arrived_at?: string | null;
  departed_at?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
};

/** Mark arrived / on-site: set arrived_at + checked_in_at if null; clear checkout. */
export function applyArrivalTimestamps(
  current: TimestampFields,
  now: string
): Pick<TimestampFields, 'arrived_at' | 'departed_at' | 'checked_in_at' | 'checked_out_at'> {
  return {
    arrived_at: current.arrived_at || now,
    checked_in_at: current.checked_in_at || now,
    checked_out_at: null,
    // Keep departed_at as-is unless caller clears it (e.g. reserved revert).
  };
}

/** Mark departed: set departed_at + checked_out_at if null; ensure check-in present. */
export function applyDepartureTimestamps(
  current: TimestampFields,
  now: string
): Pick<TimestampFields, 'arrived_at' | 'departed_at' | 'checked_in_at' | 'checked_out_at'> {
  return {
    arrived_at: current.arrived_at || current.checked_in_at || now,
    checked_in_at: current.checked_in_at || current.arrived_at || now,
    departed_at: current.departed_at || now,
    checked_out_at: current.checked_out_at || now,
  };
}

/** Clear all presence timestamps (reserved revert / cancel correction). */
export function clearPresenceTimestamps(): Required<TimestampFields> {
  return {
    arrived_at: null,
    departed_at: null,
    checked_in_at: null,
    checked_out_at: null,
  };
}
