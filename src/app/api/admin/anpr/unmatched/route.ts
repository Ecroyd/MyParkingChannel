// GET  /api/admin/anpr/unmatched?tenantId=&range=today|7d
// POST /api/admin/anpr/unmatched  { tenantId, plate }  — dismiss a plate from the card
// Cars the ANPR cameras saw that matched no booking and aren't staff, grouped by plate, for the
// dashboard card. `hasAnpr` is false when the site has had no camera reads in the last week, so
// the card can stay hidden at sites without ANPR.

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthorizedAnprAdmin } from '@/lib/anpr/adminAnprAuth';
import { getTenantDateRange } from '@/lib/timezone';
import {
  groupUnmatchedReads,
  normalisePlate,
  type DismissedPlate,
  type UnmatchedRead,
} from '@/lib/anpr/unmatchedVehicles';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_READS = 1000;

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const auth = await resolveAuthorizedAnprAdmin(params.get('tenantId'));
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { tenantId, adminClient } = auth.ctx;

    const { data: tenant } = await adminClient.from('tenants').select('timezone').eq('id', tenantId).maybeSingle();
    const { startOfDayUTC } = getTenantDateRange(tenant?.timezone || 'Europe/London');
    const range = params.get('range') === '7d' ? '7d' : 'today';
    const since = range === '7d' ? new Date(startOfDayUTC.getTime() - 6 * DAY_MS) : startOfDayUTC;
    const weekAgo = new Date(Date.now() - 7 * DAY_MS).toISOString();

    const [reads, staff, anyRead, dismissed] = await Promise.all([
      adminClient
        .from('gate_events')
        .select('id, event_at, direction, plate, plate_norm, raw_payload')
        .eq('tenant_id', tenantId)
        .eq('mode', 'anpr')
        .is('booking_id', null)
        .eq('result', 'deny')
        .gte('event_at', since.toISOString())
        .order('event_at', { ascending: false })
        .limit(MAX_READS),
      adminClient.from('staff_vehicles').select('plate').eq('tenant_id', tenantId).eq('is_active', true),
      adminClient
        .from('gate_events')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('mode', 'anpr')
        .gte('event_at', weekAgo)
        .limit(1),
      // Missing until the 20261111 migration is run; treated as "nothing dismissed".
      adminClient
        .from('anpr_dismissed_plates')
        .select('plate_norm, dismissed_at')
        .eq('tenant_id', tenantId)
        .gte('dismissed_at', since.toISOString()),
    ]);

    if (reads.error) {
      console.error('[ANPR Unmatched] Query failed:', reads.error);
      return NextResponse.json({ error: 'Failed to load camera reads' }, { status: 500 });
    }

    const vehicles = groupUnmatchedReads(
      (reads.data ?? []) as UnmatchedRead[],
      ((staff.data ?? []) as { plate: string | null }[]).map((s) => s.plate ?? ''),
      dismissed.error ? [] : ((dismissed.data ?? []) as DismissedPlate[])
    );

    return NextResponse.json({
      range,
      since: since.toISOString(),
      hasAnpr: (anyRead.data?.length ?? 0) > 0,
      truncated: (reads.data?.length ?? 0) >= MAX_READS,
      vehicles,
    });
  } catch (error: unknown) {
    console.error('[ANPR Unmatched] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { tenantId?: string; plate?: string };
    const auth = await resolveAuthorizedAnprAdmin(body.tenantId ?? null);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { tenantId, adminClient, userId } = auth.ctx;

    const plate = normalisePlate(body.plate);
    if (plate.length < 2 || plate.length > 12) {
      return NextResponse.json({ error: 'A number plate is required' }, { status: 400 });
    }

    const { error } = await adminClient
      .from('anpr_dismissed_plates')
      .upsert(
        { tenant_id: tenantId, plate_norm: plate, dismissed_at: new Date().toISOString(), dismissed_by: userId },
        { onConflict: 'tenant_id,plate_norm' }
      );
    if (error) {
      console.error('[ANPR Unmatched] Dismiss failed:', error);
      return NextResponse.json({ error: 'Could not dismiss this car' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, plate });
  } catch (error: unknown) {
    console.error('[ANPR Unmatched] Dismiss error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
