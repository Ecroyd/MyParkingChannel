// Sync booking changes to Videofit SendDbBulkUpdate
// Called when bookings are created, updated, or cancelled

import { createAdminClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

type BookingRow = {
  id: string;
  tenant_id: string;
  plate: string | null;
  start_at: string;
  end_at: string;
  status: string;
};

type AnprConfig = {
  arrival_grace_minutes: number | null;
  departure_grace_minutes: number | null;
};

/**
 * Check if Videofit is configured for relay mode (outbox) or direct push
 * Returns config if configured, null otherwise
 */
async function getVideofitConfig(
  tenantId: string,
  adminClient: SupabaseClient
): Promise<{ defaultGroup: number } | null> {
  try {
    const { data: secrets, error } = await adminClient
      .from('tenant_secrets')
      .select('key, value')
      .eq('tenant_id', tenantId)
      .in('key', [
        'videofit_base_url',
        'videofit_site_client_license',
        'videofit_default_group',
      ]);

    if (error || !secrets || secrets.length === 0) {
      return null;
    }

    const getValue = (key: string): string | null => {
      const secret = secrets.find((s) => s.key === key);
      return secret?.value || null;
    };

    const baseUrl = getValue('videofit_base_url');
    const siteClientLicense = parseInt(getValue('videofit_site_client_license') || '0', 10);
    
    // If base URL and license are set, Videofit is configured
    if (!baseUrl || !siteClientLicense) {
      return null;
    }

    const defaultGroup = parseInt(getValue('videofit_default_group') || '4', 10);

    return {
      defaultGroup,
    };
  } catch {
    return null;
  }
}

/**
 * Normalize plate: uppercase alphanumeric only
 */
function normalizePlate(plate: string | null | undefined): string | null {
  if (!plate) return null;
  // Remove all non-alphanumeric, then uppercase
  const normalized = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalized || null;
}

/**
 * Sync a single booking to Videofit
 */
export async function syncBookingToVideofit(
  booking: BookingRow,
  action: 'created' | 'updated' | 'cancelled',
  adminClient: SupabaseClient
): Promise<void> {
  try {
    // Get Videofit config
    const videofitConfig = await getVideofitConfig(booking.tenant_id, adminClient);
    if (!videofitConfig) {
      // Videofit not configured for this tenant, skip silently
      return;
    }

    // Get ANPR config for grace periods
    const { data: anprConfig } = await adminClient
      .from('tenant_anpr_config')
      .select('arrival_grace_minutes, departure_grace_minutes')
      .eq('tenant_id', booking.tenant_id)
      .maybeSingle<AnprConfig>();

    const arrivalGrace = anprConfig?.arrival_grace_minutes ?? 240; // 4 hours default
    const departureGrace = anprConfig?.departure_grace_minutes ?? 480; // 8 hours default

    // Normalize plate
    const plate = normalizePlate(booking.plate);
    if (!plate) {
      // No plate, skip
      return;
    }

    // Determine action
    const videofitAction: 'upsert' | 'delete' =
      action === 'cancelled' || booking.status === 'cancelled' ? 'delete' : 'upsert';

    // Calculate validity windows
    const startAt = new Date(booking.start_at);
    const endAt = new Date(booking.end_at);
    const validFrom = new Date(startAt.getTime() - arrivalGrace * 60 * 1000);
    const validUntil = new Date(endAt.getTime() + departureGrace * 60 * 1000);

    // Write to outbox for relay/polling approach
    const { error: outboxError } = await adminClient.from('anpr_outbox').insert({
      tenant_id: booking.tenant_id,
      booking_id: booking.id,
      plate: plate,
      group_number: videofitConfig.defaultGroup,
      valid_from: validFrom.toISOString(),
      valid_until: validUntil.toISOString(),
      action: videofitAction,
      status: 'pending',
    });

    if (outboxError) {
      console.error('[Videofit] Failed to write to outbox:', booking.id, outboxError);
      // Log error event
      const idempotencyKey = `videofit_outbox_${booking.tenant_id}_${booking.id}_${action}_${Date.now()}`;
      await adminClient.from('integration_events').insert({
        tenant_id: booking.tenant_id,
        direction: 'outbound',
        event_type: 'videofit_outbox_insert',
        idempotency_key: idempotencyKey,
        status: 'failed',
        error: outboxError.message || String(outboxError),
        payload: {
          booking_id: booking.id,
          plate: plate,
          action: videofitAction,
        },
      });
    } else {
      // Log successful outbox insert
      const idempotencyKey = `videofit_outbox_${booking.tenant_id}_${booking.id}_${action}_${Date.now()}`;
      await adminClient.from('integration_events').insert({
        tenant_id: booking.tenant_id,
        direction: 'outbound',
        event_type: 'videofit_outbox_insert',
        idempotency_key: idempotencyKey,
        status: 'success',
        payload: {
          booking_id: booking.id,
          plate: plate,
          action: videofitAction,
        },
      });
    }
  } catch (error: any) {
    console.error('[Videofit] Error syncing booking:', booking.id, error);
    // Log error event
    try {
      const idempotencyKey = `videofit_${booking.tenant_id}_${booking.id}_${action}_${Date.now()}`;
      await adminClient.from('integration_events').insert({
        tenant_id: booking.tenant_id,
        direction: 'outbound',
        event_type: 'videofit_send_db_bulk_update',
        idempotency_key: idempotencyKey,
        status: 'failed',
        error: error.message || String(error),
      });
    } catch (logError) {
      // Ignore logging errors
    }
  }
}
