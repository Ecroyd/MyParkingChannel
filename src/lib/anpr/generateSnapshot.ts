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
  errors: string[];
}

/**
 * Generate full ANPR snapshot for a tenant and insert/update outbox items
 */
export async function generateAnprSnapshot(
  tenantId: string,
  adminClient: SupabaseClient,
  reason: 'manual' | 'self-healing' = 'manual'
): Promise<SnapshotResult> {
  const result: SnapshotResult = {
    inserted: 0,
    updated: 0,
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

    // Query bookings: plate != '' and start_at <= now() + 24h and end_at >= now() - 24h
    const now = new Date();
    const futureCutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h
    const pastCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // -24h

    const { data: bookings, error: bookingsError } = await adminClient
      .from('bookings')
      .select('id, plate, start_at, end_at, status')
      .eq('tenant_id', tenantId)
      .neq('plate', '')
      .not('plate', 'is', null)
      .lte('start_at', futureCutoff.toISOString())
      .gte('end_at', pastCutoff.toISOString())
      .eq('status', 'confirmed');

    if (bookingsError) {
      result.errors.push(`Failed to fetch bookings: ${bookingsError.message}`);
      return result;
    }

    if (!bookings || bookings.length === 0) {
      return result; // No bookings to process
    }

    // Normalize and deduplicate plates
    // Map: plate -> { booking_id, earliest_valid_from, latest_valid_until }
    const plateMap = new Map<
      string,
      {
        bookingId: string;
        validFrom: Date;
        validUntil: Date;
      }
    >();

    for (const booking of bookings) {
      const plate = normalizePlate(booking.plate);
      if (!plate) continue;

      const startAt = new Date(booking.start_at);
      const endAt = new Date(booking.end_at);

      // Use booking times as validity window (can be extended with grace periods later)
      const validFrom = startAt;
      const validUntil = endAt;

      const existing = plateMap.get(plate);
      if (existing) {
        // Merge: take earliest valid_from and latest valid_until
        if (validFrom < existing.validFrom) {
          existing.validFrom = validFrom;
        }
        if (validUntil > existing.validUntil) {
          existing.validUntil = validUntil;
        }
      } else {
        plateMap.set(plate, {
          bookingId: booking.id,
          validFrom,
          validUntil,
        });
      }
    }

    // Insert/update outbox items for each unique plate
    for (const [plate, data] of plateMap.entries()) {
      // Check if an unprocessed outbox item already exists for this plate
      const { data: existing } = await adminClient
        .from('anpr_outbox')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('plate', plate)
        .is('processed_at', null)
        .maybeSingle();

      if (existing) {
        // Update existing unprocessed item
        const { error: updateError } = await adminClient
          .from('anpr_outbox')
          .update({
            booking_id: data.bookingId,
            group_number: defaultGroup,
            valid_from: data.validFrom.toISOString(),
            valid_until: data.validUntil.toISOString(),
            action: 'upsert',
            status: 'pending',
          })
          .eq('id', existing.id);

        if (updateError) {
          result.errors.push(`Failed to update outbox item for plate ${plate}: ${updateError.message}`);
        } else {
          result.updated++;
        }
      } else {
        // Insert new item
        const { error: insertError } = await adminClient.from('anpr_outbox').insert({
          tenant_id: tenantId,
          booking_id: data.bookingId,
          plate: plate,
          group_number: defaultGroup,
          valid_from: data.validFrom.toISOString(),
          valid_until: data.validUntil.toISOString(),
          action: 'upsert',
          status: 'pending',
        });

        if (insertError) {
          result.errors.push(`Failed to insert outbox item for plate ${plate}: ${insertError.message}`);
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

