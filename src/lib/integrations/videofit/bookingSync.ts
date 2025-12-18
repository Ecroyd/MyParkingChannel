// Sync booking changes to Videofit
// Called when bookings are created, updated, or cancelled

import { createAdminClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getVideofitConfig,
  sendVideofitUpdate,
  formatVideofitDate,
  normalizePlate,
  type VideofitAction,
} from './service';

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
    let videofitAction: VideofitAction;
    if (action === 'cancelled' || booking.status === 'cancelled') {
      videofitAction = 'DELETE';
    } else {
      // For created/updated, use ADD (Videofit handles upsert)
      videofitAction = 'ADD';
    }

    // Calculate validity windows
    const startAt = new Date(booking.start_at);
    const endAt = new Date(booking.end_at);
    const validFrom = new Date(startAt.getTime() - arrivalGrace * 60 * 1000);
    const validUntil = new Date(endAt.getTime() + departureGrace * 60 * 1000);

    // Build record
    const record = {
      Plate: plate,
      Group: 4, // Self Park
      ValidFrom: formatVideofitDate(validFrom),
      ValidUntil: formatVideofitDate(validUntil),
    };

    // Send to Videofit
    const result = await sendVideofitUpdate(videofitConfig, videofitAction, [record]);

    // Log integration event
    const idempotencyKey = `videofit_${booking.tenant_id}_${booking.id}_${action}_${Date.now()}`;
    await adminClient.from('integration_events').insert({
      tenant_id: booking.tenant_id,
      direction: 'outbound',
      event_type: 'videofit_db_bulk_update',
      idempotency_key: idempotencyKey,
      status: result.success ? 'success' : 'failed',
      http_status: result.statusCode || null,
      payload: {
        action: videofitAction,
        booking_id: booking.id,
        booking_reference: (booking as any).reference || null,
        plate: plate,
        records: [record],
      },
      response: result.response || null,
      error: result.error || null,
    });

    if (!result.success) {
      console.error('[Videofit] Failed to sync booking:', booking.id, result.error);
    }
  } catch (error: any) {
    console.error('[Videofit] Error syncing booking:', booking.id, error);
    // Log error event
    try {
      const idempotencyKey = `videofit_${booking.tenant_id}_${booking.id}_${action}_${Date.now()}`;
      await adminClient.from('integration_events').insert({
        tenant_id: booking.tenant_id,
        direction: 'outbound',
        event_type: 'videofit_db_bulk_update',
        idempotency_key: idempotencyKey,
        status: 'failed',
        error: error.message || String(error),
      });
    } catch (logError) {
      // Ignore logging errors
    }
  }
}
