/**
 * Authoritative column selection for the admin bookings list (SSR + API).
 * Keep this list in sync with fields rendered/filtered by BookingsServerClient.
 * NEVER use select('*') for the booking list.
 */

export const ADMIN_BOOKING_LIST_COLUMNS = [
  'id',
  'tenant_id',
  'reference',
  'customer_name',
  'customer_email',
  'customer_phone',
  'plate',
  'car_make',
  'car_model',
  'car_color',
  'start_at',
  'end_at',
  'status',
  'ops_status',
  'gate_status',
  'anpr_status',
  'flight_number',
  'return_flight_number',
  'external_source',
  'source',
  'money_charged',
  'money_received',
  'highlight_code',
  'is_incomplete',
  'missing_fields',
  'dynamic_pricing_applied',
  'dynamic_pricing_multiplier',
  'dynamic_pricing_occupancy_percent',
  'dynamic_pricing_rule_id',
  'updated_at',
  'created_at',
] as const;

export type AdminBookingListColumn = (typeof ADMIN_BOOKING_LIST_COLUMNS)[number];

/** Comma-separated PostgREST select string — must never be '*'. */
export const ADMIN_BOOKING_LIST_SELECT: string = ADMIN_BOOKING_LIST_COLUMNS.join(', ');

export type BookingAdminListRow = {
  id: string;
  tenant_id: string;
  reference: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  plate: string | null;
  car_make: string | null;
  car_model: string | null;
  car_color: string | null;
  start_at: string;
  end_at: string;
  status: string | null;
  ops_status: string | null;
  gate_status: string | null;
  anpr_status: string | null;
  flight_number: string | null;
  return_flight_number: string | null;
  external_source: string | null;
  source: string | null;
  money_charged: number | null;
  money_received: number | null;
  highlight_code: string | null;
  is_incomplete: boolean | null;
  missing_fields: string[] | null;
  dynamic_pricing_applied: boolean | null;
  dynamic_pricing_multiplier: number | null;
  dynamic_pricing_occupancy_percent: number | null;
  dynamic_pricing_rule_id: string | null;
  updated_at: string | null;
  created_at: string | null;
};

/** Static guard — fails if selection is widened back to '*'. */
export function assertAdminBookingListSelectSafe(select: string = ADMIN_BOOKING_LIST_SELECT): void {
  const normalized = select.trim();
  if (!normalized) {
    throw new Error('ADMIN_BOOKING_LIST_SELECT must not be empty');
  }
  if (normalized === '*' || /(^|,)\s*\*\s*(,|$)/.test(normalized)) {
    throw new Error('ADMIN_BOOKING_LIST_SELECT must not use select("*")');
  }
  for (const col of ADMIN_BOOKING_LIST_COLUMNS) {
    if (!normalized.split(',').map((c) => c.trim()).includes(col)) {
      throw new Error(`ADMIN_BOOKING_LIST_SELECT missing required column: ${col}`);
    }
  }
}

assertAdminBookingListSelectSafe();
