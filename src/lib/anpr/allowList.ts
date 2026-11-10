// src/lib/anpr/allowList.ts
//
// The plates an on-site gateway should hold in the ANPR cameras' allow-lists, so the barrier
// opens for expected cars by itself (GET /api/internal/anpr/allowlist). The gateway reconciles the
// cameras against this whole list, so it works ahead: bookings are included days before they
// start, with their validity dates, and the camera enforces the dates. A gateway that is switched
// off overnight therefore only misses bookings made, changed or cancelled while it was off.

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePlate } from '@/lib/anpr/captureBookingMatch';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type AllowListRules = {
  /** Include bookings starting up to this far ahead. */
  lookaheadMs: number;
  /** Allowed in this long before the booked start (early arrivals). */
  earlyMs: number;
  /** Still allowed this long after the booked end (late returns). */
  graceMs: number;
  /** A car that arrived and hasn't left stays allowed at least this far ahead of now. */
  onSiteMs: number;
};

export const DEFAULT_ALLOW_LIST_RULES: AllowListRules = {
  lookaheadMs: 7 * DAY,
  earlyMs: 12 * HOUR,
  graceMs: 12 * HOUR,
  onSiteMs: 2 * DAY,
};

export type AllowListBooking = {
  plate: string | null;
  start_at: string;
  end_at: string;
  status: string | null;
  arrived_at: string | null;
  departed_at: string | null;
};

export type AllowListEntry = {
  plate: string;
  validFrom: string;
  validUntil: string;
  reason: 'booking' | 'on_site' | 'staff';
};

/** One entry per plate: the widest window across its bookings, plus active staff vehicles. */
export function buildAllowList(
  bookings: AllowListBooking[],
  staffPlates: (string | null)[],
  now: Date,
  rules: AllowListRules = DEFAULT_ALLOW_LIST_RULES
): AllowListEntry[] {
  const t = now.getTime();
  const byPlate = new Map<string, { from: number; until: number; reason: AllowListEntry['reason'] }>();
  const merge = (plate: string, from: number, until: number, reason: AllowListEntry['reason']) => {
    const e = byPlate.get(plate);
    if (!e) return void byPlate.set(plate, { from, until, reason });
    e.from = Math.min(e.from, from);
    e.until = Math.max(e.until, until);
    if (reason === 'staff' || (reason === 'on_site' && e.reason === 'booking')) e.reason = reason;
  };

  for (const b of bookings) {
    const plate = normalizePlate(b.plate);
    if (!plate || b.status === 'cancelled' || b.departed_at) continue;
    const start = Date.parse(b.start_at);
    const end = Date.parse(b.end_at);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;

    const onSite = Boolean(b.arrived_at);
    let until = end + rules.graceMs;
    if (onSite) until = Math.max(until, t + rules.onSiteMs);
    if (until < t || start - t > rules.lookaheadMs) continue;
    merge(plate, start - rules.earlyMs, until, onSite ? 'on_site' : 'booking');
  }

  for (const raw of staffPlates) {
    const plate = normalizePlate(raw);
    if (plate) merge(plate, t - DAY, t + 365 * DAY, 'staff');
  }

  return [...byPlate.entries()]
    .map(([plate, e]) => ({
      plate,
      validFrom: new Date(e.from).toISOString(),
      validUntil: new Date(e.until).toISOString(),
      reason: e.reason,
    }))
    .sort((a, b) => a.plate.localeCompare(b.plate));
}

/** Load the tenant's bookings and staff vehicles and build its allow-list. */
export async function loadAllowList(
  supabase: SupabaseClient,
  tenantId: string,
  now: Date = new Date(),
  rules: AllowListRules = DEFAULT_ALLOW_LIST_RULES
): Promise<AllowListEntry[]> {
  const horizon = new Date(now.getTime() + rules.lookaheadMs).toISOString();
  const earliestEnd = new Date(now.getTime() - rules.graceMs).toISOString();
  const select = 'plate, start_at, end_at, status, arrived_at, departed_at';

  const [upcoming, onSite, staff] = await Promise.all([
    // Booked now or soon (not yet ended past the grace period).
    supabase
      .from('bookings')
      .select(select)
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .not('plate', 'is', null)
      .is('departed_at', null)
      .lte('start_at', horizon)
      .gte('end_at', earliestEnd),
    // Arrived and not left, however overdue: they must be able to get out.
    supabase
      .from('bookings')
      .select(select)
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .not('plate', 'is', null)
      .not('arrived_at', 'is', null)
      .is('departed_at', null)
      .lt('end_at', earliestEnd)
      .gte('start_at', new Date(now.getTime() - 60 * DAY).toISOString()),
    supabase.from('staff_vehicles').select('plate').eq('tenant_id', tenantId).eq('is_active', true),
  ]);

  // A partial list would make the gateway remove plates that should stay, so fail instead.
  for (const r of [upcoming, onSite, staff]) {
    if (r.error) throw new Error(`Allow-list query failed: ${r.error.message}`);
  }

  return buildAllowList(
    [...((upcoming.data ?? []) as AllowListBooking[]), ...((onSite.data ?? []) as AllowListBooking[])],
    ((staff.data ?? []) as { plate: string | null }[]).map((s) => s.plate),
    now,
    rules
  );
}
