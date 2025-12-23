// GET /api/internal/anpr/snapshot - Get full snapshot of vehicles from bookings (read-only)
// POST /api/internal/anpr/snapshot - Generate snapshot and insert/update outbox items (self-healing)
// Authenticated via x-relay-token header

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRelayAuth } from '../_relayAuth';
import { generateAnprSnapshot } from '@/lib/anpr/generateSnapshot';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
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

export async function GET(req: NextRequest) {
  try {
    // Get tenantId from query params
    const tenantId = req.nextUrl.searchParams.get('tenantId') ?? '';

    if (!tenantId) {
      return Response.json(
        { error: 'tenantId query parameter is required' },
        { status: 400 }
      );
    }

    // Authenticate via x-relay-token header
    const auth = await requireRelayAuth(req, tenantId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const supabase = supabaseAdmin();

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

    return Response.json({
      ok: true,
      items: snapshotItems,
      count: snapshotItems.length,
    });
  } catch (error: any) {
    console.error('[ANPR Snapshot] Error:', error);
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/internal/anpr/snapshot - Generate snapshot and insert/update outbox items
 * Self-healing mode: ANPR PC can trigger snapshot if outbox is empty
 */
export async function POST(req: NextRequest) {
  try {
    // Get tenantId from query params
    const tenantId = req.nextUrl.searchParams.get('tenantId') ?? '';

    if (!tenantId) {
      return Response.json(
        { error: 'tenantId query parameter is required' },
        { status: 400 }
      );
    }

    // Authenticate via x-relay-token header
    const auth = await requireRelayAuth(req, tenantId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const debug = req.nextUrl.searchParams.get('debug') === '1';
    const adminClient = supabaseAdmin();

    // Generate snapshot and insert/update outbox items
    const snapshotResult = await generateAnprSnapshot(tenantId, adminClient, 'self-healing');

    // Get pending count for debug
    const pendingCount = debug
      ? await adminClient
          .from('anpr_outbox')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'pending')
      : null;

    if (snapshotResult.errors.length > 0) {
      console.error('[ANPR Snapshot POST] Errors:', snapshotResult.errors);
      return Response.json(
        {
          ok: false,
          error: 'Failed to generate snapshot',
          details: snapshotResult.errors,
          inserted: snapshotResult.inserted,
          updated: snapshotResult.updated,
          ...(debug && {
            debug: {
              bookingsScanned: snapshotResult.bookingsScanned,
              pendingCount: pendingCount?.count ?? 0,
            },
          }),
        },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      inserted: snapshotResult.inserted,
      updated: snapshotResult.updated,
      message: `Snapshot generated: ${snapshotResult.inserted} inserted, ${snapshotResult.updated} updated`,
      ...(debug && {
        debug: {
          bookingsScanned: snapshotResult.bookingsScanned,
          outboxUpserts: snapshotResult.inserted + snapshotResult.updated,
          pendingCount: pendingCount?.count ?? 0,
        },
      }),
    });
  } catch (error: any) {
    console.error('[ANPR Snapshot POST] Error:', error);
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

