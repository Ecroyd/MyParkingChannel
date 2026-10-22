import { createHmac } from 'crypto';

/**
 * Key for the customer manage-booking session JWT.
 * Uses BOOKING_SESSION_SECRET when set. Otherwise derives a key from the Supabase service
 * role key (always set in production) instead of the old public 'change-me-in-env'
 * fallback, which let anyone forge a session for any booking.
 */
export function getBookingSessionSecret(): Uint8Array {
  const configured = process.env.BOOKING_SESSION_SECRET?.trim();
  if (configured) return new TextEncoder().encode(configured);

  const base = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!base) throw new Error('BOOKING_SESSION_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set');
  return new Uint8Array(createHmac('sha256', base).update('manage-booking-session-v1').digest());
}
