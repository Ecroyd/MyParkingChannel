// src/lib/bookings/dedupe.ts
// Shared utilities for generating dedupe keys and checking for duplicate bookings

import crypto from 'crypto';

/**
 * Round a timestamp to the nearest minute (removes seconds and milliseconds)
 */
function roundToMinute(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  d.setSeconds(0, 0);
  return d.toISOString();
}

/**
 * Generate a dedupe key for a booking
 * 
 * Priority:
 * 1. If reference is provided: `ref:${reference.toLowerCase()}`
 * 2. If external reference + partner: `partner:external_ref`
 * 3. Otherwise: hash of plate/email + start_at + end_at (rounded to minute)
 */
export function makeDedupeKey(opts: {
  reference?: string | null;
  external_reference?: string | null;
  partner?: string | null;
  plate?: string | null;
  customer_email?: string | null;
  start_at?: string | null;
  end_at?: string | null;
}): string | null {
  // Priority 1: External reference with partner (for supplier API)
  if (opts.external_reference && opts.partner) {
    return `${opts.partner.toLowerCase()}:${opts.external_reference}`;
  }

  // Priority 2: Reference-based dedupe
  if (opts.reference) {
    return `ref:${String(opts.reference).toLowerCase()}`;
  }

  // Priority 3: Signature-based dedupe (plate/email + times)
  const basis =
    (opts.plate ? opts.plate.toUpperCase().replace(/\s+/g, '') : '') ||
    (opts.customer_email ? opts.customer_email.toLowerCase() : '') ||
    'unknown';

  const startM = roundToMinute(opts.start_at || undefined);
  const endM = roundToMinute(opts.end_at || undefined);
  
  if (!startM || !endM) {
    // If we don't have times, we can't create a reliable dedupe key
    return null;
  }

  const raw = `${basis}|${startM}|${endM}`;
  const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
  return `sig:${hash}`;
}

/**
 * Check if a booking with the given dedupe_key already exists for a tenant
 * Returns the existing booking if found, null otherwise
 */
export async function checkDuplicateBooking(
  supabase: any,
  tenantId: string,
  dedupeKey: string | null
): Promise<{ id: string; reference: string; status: string; created_at: string } | null> {
  if (!dedupeKey) {
    return null;
  }

  const { data: existing, error } = await supabase
    .from('bookings')
    .select('id, reference, status, created_at')
    .eq('tenant_id', tenantId)
    .eq('dedupe_key', dedupeKey)
    .maybeSingle();

  if (error || !existing) {
    return null;
  }

  return existing;
}

/**
 * Generate dedupe key for import/upload scenarios
 * Uses: source|reference|plate|start_utc (SHA256 hash)
 */
export function makeImportDedupeKey(opts: {
  source: string;
  reference: string;
  vehicle_reg: string;
  start_utc: string;
}): string {
  const raw = `${opts.source.toLowerCase()}|${opts.reference.toUpperCase()}|${opts.vehicle_reg.toUpperCase()}|${opts.start_utc}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

