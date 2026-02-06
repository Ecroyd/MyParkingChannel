/**
 * Ops status values for arrivals/departures UI.
 * Single source of truth for dropdown options and filtering.
 */

export const OPS_STATUS = {
  ARRIVED: 'arrived',
  NO_SHOW: 'no_show',
  TAKE_KEY: 'take_key',
  ARRIVED_KEY_TAKEN: 'arrived_key_taken',
  DEPARTED: 'departed',
} as const;

export type OpsStatus = (typeof OPS_STATUS)[keyof typeof OPS_STATUS];

export const OPS_STATUS_LABELS: Record<OpsStatus, string> = {
  [OPS_STATUS.ARRIVED]: 'Arrived',
  [OPS_STATUS.NO_SHOW]: 'No Show',
  [OPS_STATUS.TAKE_KEY]: 'Take Key',
  [OPS_STATUS.ARRIVED_KEY_TAKEN]: 'Arrived & Key Taken',
  [OPS_STATUS.DEPARTED]: 'Departed',
};

/** Options for Arrivals section dropdown */
export const ARRIVALS_OPS_OPTIONS: OpsStatus[] = [
  OPS_STATUS.ARRIVED,
  OPS_STATUS.NO_SHOW,
  OPS_STATUS.TAKE_KEY,
  OPS_STATUS.ARRIVED_KEY_TAKEN,
];

/** Options for Departures section dropdown (only Departed) */
export const DEPARTURES_OPS_OPTIONS: OpsStatus[] = [OPS_STATUS.DEPARTED];

/** Statuses that exclude a booking from the Departures list */
export const DEPARTURES_EXCLUDED_OPS_STATUSES: OpsStatus[] = [
  OPS_STATUS.NO_SHOW,
  OPS_STATUS.DEPARTED,
];

/** Gate status values (for display when ops_status not set) */
export const GATE_STATUS = {
  RESERVED: 'reserved',
  ARRIVED: 'arrived',
  DEPARTED: 'departed',
  CANCELLED: 'cancelled',
} as const;

export type GateStatusValue = (typeof GATE_STATUS)[keyof typeof GATE_STATUS];

/** Placeholder value when no ops_status is set (dropdown shows "— Ops —", not Reserved). */
export const OPS_STATUS_NONE = 'none' as const;

/**
 * Single source of truth for status label + pill styling (replaces old badge column).
 * Used by StatusSelect trigger so dropdown looks like the old GateStatusBadge.
 * Ops dropdown: none = grey "— Ops —"; arrived = red; no_show = red bg; take_key = yellow bg; arrived_key_taken = yellow bg red text; departed = sky.
 */
export const STATUS_UI: Record<string, { label: string; pill: string }> = {
  [GATE_STATUS.RESERVED]: { label: 'Reserved', pill: 'bg-slate-100 text-slate-900 border-slate-200' },
  [GATE_STATUS.ARRIVED]: { label: 'Arrived', pill: 'bg-emerald-100 text-emerald-900 border-emerald-200' },
  [GATE_STATUS.DEPARTED]: { label: 'Departed', pill: 'bg-sky-100 text-sky-900 border-sky-200' },
  [GATE_STATUS.CANCELLED]: { label: 'Cancelled', pill: 'bg-red-100 text-red-900 border-red-200' },
  [OPS_STATUS_NONE]: { label: '— Ops —', pill: 'bg-gray-100 text-gray-500 border-gray-200' },
  // OPS_STATUS.ARRIVED === GATE_STATUS.ARRIVED ('arrived'), same key as above
  [OPS_STATUS.NO_SHOW]: { label: 'No Show', pill: 'bg-red-200 text-black border-red-300' },
  [OPS_STATUS.TAKE_KEY]: { label: 'Take Key', pill: 'bg-amber-200 text-black border-amber-300' },
  [OPS_STATUS.ARRIVED_KEY_TAKEN]: { label: 'Arrived & Key Taken', pill: 'bg-amber-200 text-red-700 border-amber-300' },
  // OPS_STATUS.DEPARTED === GATE_STATUS.DEPARTED ('departed'), same key as above
};

export function getStatusLabel(value: string): string {
  return STATUS_UI[value]?.label ?? value ? value.replace(/_/g, ' ') : 'Status';
}

export function getStatusPillClass(value: string): string {
  return STATUS_UI[value]?.pill ?? 'bg-gray-100 text-gray-700 border-gray-200';
}
