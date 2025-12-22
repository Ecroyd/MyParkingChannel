// GET /api/internal/anpr/snapshot - Get full snapshot of vehicles from bookings
// Authenticated via x-relay-token header

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { authenticateRelayRequest } from '@/lib/anpr/relayAuth';

/**
 * Normalize plate: uppercase alphanumeric only
 */
function normalizePlate(plate: string | null | undefined): string | null {
  if (!plate) return null;
  // Remove all non-alphanumeric, then uppercase
  const normalized = plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return normalized || null;
}

export async function GET(req: NextRequest) {
  try {
    // Get tenantId from query params
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId query parameter is required' },
        { status: 400 }
      );
    }

    // Authenticate via x-relay-token header
    const relayToken = req.headers.get('x-relay-token');
    const site = await authenticateRelayRequest(tenantId, relayToken);

    if (!site) {
      return NextResponse.json(
        { error: 'Invalid or missing relay token' },
        { status: 401 }
      );
    }

    if (!site.enabled) {
      return NextResponse.json(
        { error: 'ANPR site is not enabled' },
        { status: 403 }
      );
    }

    const supabase = createAdminClient();

    // Fetch ANPR site config for snapshot rules
    const { data: anprSite, error: siteError } = await supabase
      .from('anpr_sites')
      .select('include_upcoming_hours, grace_after_end_hours, default_group')
      .eq('tenant_id', tenantId)
      .single();

    if (siteError || !anprSite) {
      return NextResponse.json(
        { error: 'ANPR site configuration not found' },
        { status: 404 }
      );
    }

    const includeUpcomingHours = anprSite.include_upcoming_hours || 48;
    const graceAfterEndHours = anprSite.grace_after_end_hours || 12;
    const defaultGroup = anprSite.default_group || 4;

    const now = new Date();
    const upcomingCutoff = new Date(now.getTime() + includeUpcomingHours * 60 * 60 * 1000);
    const graceCutoff = new Date(now.getTime() - graceAfterEndHours * 60 * 60 * 1000);

    // Fetch bookings that should be included:
    // 1. Currently on site (checked_in_at not null and checked_out_at null)
    // 2. Upcoming bookings within include_upcoming_hours
    // 3. Recent bookings within grace_after_end_hours after end_at
    // Only confirmed bookings
    
    // Build separate queries for each condition and combine
    const queries = [
      // Currently on site
      supabase
        .from('bookings')
        .select('id, plate, start_at, end_at, checked_in_at, checked_out_at, status')
        .eq('tenant_id', tenantId)
        .eq('status', 'confirmed')
        .not('checked_in_at', 'is', null)
        .is('checked_out_at', null),
      
      // Upcoming bookings
      supabase
        .from('bookings')
        .select('id, plate, start_at, end_at, checked_in_at, checked_out_at, status')
        .eq('tenant_id', tenantId)
        .eq('status', 'confirmed')
        .gte('start_at', now.toISOString())
        .lte('start_at', upcomingCutoff.toISOString()),
      
      // Recent bookings in grace period
      supabase
        .from('bookings')
        .select('id, plate, start_at, end_at, checked_in_at, checked_out_at, status')
        .eq('tenant_id', tenantId)
        .eq('status', 'confirmed')
        .gte('end_at', graceCutoff.toISOString())
        .lte('end_at', now.toISOString()),
    ];

    const results = await Promise.all(queries);
    const allBookings: any[] = [];
    const bookingIds = new Set<string>();

    for (const result of results) {
      if (result.error) {
        console.error('[ANPR Snapshot] Query error:', result.error);
        continue;
      }
      if (result.data) {
        for (const booking of result.data) {
          if (!bookingIds.has(booking.id)) {
            bookingIds.add(booking.id);
            allBookings.push(booking);
          }
        }
      }
    }

    const bookings = allBookings;

    // Build snapshot items
    const snapshotItems: Array<{
      id: string;
      plate: string;
      group: number;
      valid_from: string;
      valid_to: string;
    }> = [];

    const plateMap = new Map<string, {
      id: string;
      group: number;
      valid_from: Date;
      valid_to: Date;
    }>();

    for (const booking of bookings || []) {
      const plate = normalizePlate(booking.plate);
      if (!plate) continue;

      const startAt = new Date(booking.start_at);
      const endAt = new Date(booking.end_at);

      // Determine validity window based on booking state
      let validFrom: Date;
      let validTo: Date;

      if (booking.checked_in_at && !booking.checked_out_at) {
        // Currently on site - valid from now until end + grace
        validFrom = now;
        validTo = new Date(endAt.getTime() + graceAfterEndHours * 60 * 60 * 1000);
      } else if (startAt > now) {
        // Upcoming booking - valid from start to end + grace
        validFrom = startAt;
        validTo = new Date(endAt.getTime() + graceAfterEndHours * 60 * 60 * 1000);
      } else if (endAt >= graceCutoff) {
        // Recent booking in grace period - valid from now until end + grace
        validFrom = now;
        validTo = new Date(endAt.getTime() + graceAfterEndHours * 60 * 60 * 1000);
      } else {
        // Shouldn't happen based on query, but skip just in case
        continue;
      }

      // Merge overlapping entries for same plate (take widest window)
      const existing = plateMap.get(plate);
      if (existing) {
        if (validFrom < existing.valid_from) {
          existing.valid_from = validFrom;
        }
        if (validTo > existing.valid_to) {
          existing.valid_to = validTo;
        }
      } else {
        plateMap.set(plate, {
          id: booking.id,
          group: defaultGroup, // TODO: Could override with booking-specific group later
          valid_from: validFrom,
          valid_to: validTo,
        });
      }
    }

    // Convert map to array
    for (const [plate, data] of plateMap.entries()) {
      snapshotItems.push({
        id: data.id,
        plate,
        group: data.group,
        valid_from: data.valid_from.toISOString(),
        valid_to: data.valid_to.toISOString(),
      });
    }

    return NextResponse.json({
      ok: true,
      items: snapshotItems,
      count: snapshotItems.length,
    });
  } catch (error: any) {
    console.error('[ANPR Snapshot] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

