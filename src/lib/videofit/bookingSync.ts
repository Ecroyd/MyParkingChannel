// Sync booking changes to Videofit SendDbBulkUpdate
// Called when bookings are created, updated, or cancelled

import { createAdminClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendDbBulkUpdate, type VideofitConfig, type VideofitRow } from './sendDbBulkUpdate';
import { toVideofitTicks } from './ticks';

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
 * Get Videofit config from tenant_secrets
 */
async function getVideofitConfig(
  tenantId: string,
  adminClient: SupabaseClient
): Promise<VideofitConfig | null> {
  try {
    const { data: secrets, error } = await adminClient
      .from('tenant_secrets')
      .select('key, value')
      .eq('tenant_id', tenantId)
      .in('key', [
        'videofit_base_url',
        'videofit_site_client_license',
        'videofit_loc_pc_no',
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
    if (!baseUrl) {
      return null;
    }

    const siteClientLicense = parseInt(getValue('videofit_site_client_license') || '0', 10);
    if (!siteClientLicense) {
      return null;
    }

    const locPcNo = parseInt(getValue('videofit_loc_pc_no') || '0', 10);
    const defaultGroup = parseInt(getValue('videofit_default_group') || '4', 10);

    return {
      baseUrl,
      siteClientLicense,
      locPcNo,
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

    // Build row
    const row: VideofitRow = {
      plate,
      group: videofitConfig.defaultGroup,
      validFrom,
      validUntil,
      action: videofitAction,
    };

    // Send to Videofit
    const result = await sendDbBulkUpdate(videofitConfig, [row]);

    // Log integration event
    const idempotencyKey = `videofit_${booking.tenant_id}_${booking.id}_${action}_${Date.now()}`;
    const payload = {
      action: videofitAction,
      booking_id: booking.id,
      booking_reference: (booking as any).reference || null,
      plate: plate,
      rows: [row],
    };
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    await adminClient.from('integration_events').insert({
      tenant_id: booking.tenant_id,
      direction: 'outbound',
      event_type: 'videofit_send_db_bulk_update',
      idempotency_key: idempotencyKey,
      payload_hash: payloadHash,
      status: result.success ? 'success' : 'failed',
      http_status: result.statusCode || null,
      duration_ms: result.durationMs || null,
      payload: payload,
      response: result.response || null,
      error: result.error || null,
    });

    if (!result.success) {
      console.error('[Videofit] Failed to sync booking:', booking.id, result.error);
      // TODO: Queue for retry with exponential backoff
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
