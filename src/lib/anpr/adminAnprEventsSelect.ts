/**
 * Explicit column selections for ANPR admin event lists.
 * Never use select('*') for list endpoints.
 */

export const ADMIN_GATE_EVENTS_LIST_SELECT = [
  'id',
  'event_at',
  'mode',
  'direction',
  'plate',
  'plate_norm',
  'qr_code',
  'result',
  'reason',
  'confidence',
  'lane',
  'camera_id',
  'booking_id',
  'source',
  'processed_at',
  'device_id',
  'gate_devices(id, name)',
  'bookings(id, reference, status)',
].join(', ');

export const ADMIN_ANPR_EVENTS_LIST_SELECT = [
  'id',
  'event_at',
  'direction',
  'plate_raw',
  'plate_normalized',
  'confidence',
  'camera_id',
  'status',
  'booking_id',
  'bookings(id, reference, status)',
].join(', ');

export const ADMIN_ANPR_CONFIG_SELECT = [
  'tenant_id',
  'enabled',
  'ingest_method',
  'dedupe_seconds',
  'offline_after_minutes',
  'camera_direction_map',
  'arrival_grace_minutes',
  'departure_grace_minutes',
  'whitelist_lookahead_days',
  'whitelist_keep_after_end_hours',
  'default_group',
  'csv_enabled',
  'csv_token_last_rotated_at',
  'videofit_api_url',
  'videofit_username',
  // deliberately omit videofit_password — never return secrets
  'videofit_ingest_enabled',
  'created_at',
  'updated_at',
].join(', ');

export const ADMIN_GATE_DEVICES_SELECT = 'id, name, kind, status, last_seen';

export function assertAnprListSelectSafe(select: string): void {
  const normalized = select.trim();
  if (!normalized || normalized === '*' || /(^|,)\s*\*\s*(,|$)/.test(normalized)) {
    throw new Error('ANPR list select must not use select("*")');
  }
}

assertAnprListSelectSafe(ADMIN_GATE_EVENTS_LIST_SELECT);
assertAnprListSelectSafe(ADMIN_ANPR_EVENTS_LIST_SELECT);
assertAnprListSelectSafe(ADMIN_ANPR_CONFIG_SELECT);
