// Shared helper to generate ANPR snapshot from bookings and insert into outbox
// Used by both admin emit-snapshot and internal snapshot endpoints

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Normalize plate: uppercase alphanumeric only
 */
function normalizePlate(plate: string | null | undefined): string | null {
  if (!plate) return null;
  // Remove all non-alphanumeric, then uppercase
  const normalized = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalized || null;
}

interface SnapshotResult {
  inserted: number;
  updated: number;
  bookingsScanned: number;
  errors: string[];
}

/**
 * Generate full ANPR snapshot for a tenant and insert/update outbox items
 * Creates one outbox row per booking (no plate deduplication)
 */
export async function generateAnprSnapshot(
  tenantId: string,
  adminClient: SupabaseClient,
  reason: 'manual' | 'self-healing' = 'manual'
): Promise<SnapshotResult> {
  const result: SnapshotResult = {
    inserted: 0,
    updated: 0,
    bookingsScanned: 0,
    errors: [],
  };

  try {
    // Get ANPR site config for default group
    const { data: anprSite, error: siteError } = await adminClient
      .from('anpr_sites')
      .select('default_group')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (siteError) {
      result.errors.push(`Failed to fetch ANPR site config: ${siteError.message}`);
      return result;
    }

    const defaultGroup = anprSite?.default_group ?? 4;

    // Query bookings: plate != '' AND start_at <= now() + 24h AND end_at >= now() - 24h
    // Only include confirmed bookings (exclude cancelled, test bookings)
    const now = new Date();
    const futureCutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h
    const pastCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // -24h

    const { data: bookings, error: bookingsError } = await adminClient
      .from('bookings')
      .select('id, plate, start_at, end_at, status, reference')
      .eq('tenant_id', tenantId)
      .eq('status', 'confirmed') // Only confirmed bookings
      .neq('plate', '')
      .not('plate', 'is', null)
      .lte('start_at', futureCutoff.toISOString())
      .gte('end_at', pastCutoff.toISOString());

    if (bookingsError) {
      result.errors.push(`Failed to fetch bookings: ${bookingsError.message}`);
      return result;
    }

    result.bookingsScanned = bookings?.length ?? 0;

    if (!bookings || bookings.length === 0) {
      return result; // No bookings to process
    }

    // Process each booking: create one outbox row per booking
    for (const booking of bookings) {
      // Skip test bookings (identified by reference containing "TEST" or plate being "TEST123")
      const isTestBooking =
        (booking.reference && booking.reference.toUpperCase().includes('TEST')) ||
        normalizePlate(booking.plate) === 'TEST123';
      
      if (isTestBooking) {
        continue; // Skip test bookings
      }

      const plate = normalizePlate(booking.plate);
      if (!plate) continue; // Skip if plate normalizes to empty

      const outboxData = {
        tenant_id: tenantId,
        booking_id: booking.id,
        plate: plate,
        group_number: defaultGroup,
        valid_from: booking.start_at,
        valid_until: booking.end_at,
        action: 'upsert' as const,
        status: 'pending' as const,
        retry_count: 0,
      };

      // Check if row exists for this (tenant_id, booking_id)
      const { data: existing } = await adminClient
        .from('anpr_outbox')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('booking_id', booking.id)
        .maybeSingle();

      if (existing) {
        // Update existing row
        const { error: updateError } = await adminClient
          .from('anpr_outbox')
          .update({
            plate: outboxData.plate,
            group_number: outboxData.group_number,
            valid_from: outboxData.valid_from,
            valid_until: outboxData.valid_until,
            action: outboxData.action,
            status: outboxData.status,
            retry_count: outboxData.retry_count,
          })
          .eq('id', existing.id);

        if (updateError) {
          result.errors.push(`Failed to update outbox for booking ${booking.id}: ${updateError.message}`);
        } else {
          result.updated++;
        }
      } else {
        // Insert new row
        const { error: insertError } = await adminClient.from('anpr_outbox').insert(outboxData);
        if (insertError) {
          result.errors.push(`Failed to insert outbox for booking ${booking.id}: ${insertError.message}`);
        } else {
          result.inserted++;
        }
      }
    }

    return result;
  } catch (error: any) {
    result.errors.push(`Unexpected error: ${error.message || String(error)}`);
    return result;
  }
}

