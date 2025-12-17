// Shared CSV generation for ANPR known vehicles export
// Used by both admin and hosted endpoints

import { createAdminClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

type TenantAnprConfig = {
  arrival_grace_minutes: number | null;
  departure_grace_minutes: number | null;
  default_group: string | null;
};

function normalizePlate(input: string) {
  return input.replace(/\s+/g, '').trim().toUpperCase();
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

// Format: YYYY-MM-DD HH:mm (UTC)
function formatUtc(dt: Date) {
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())} ${pad2(
    dt.getUTCHours()
  )}:${pad2(dt.getUTCMinutes())}`;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
}

function endOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59));
}

export async function generateKnownVehiclesCsv(
  tenantId: string,
  adminClient: SupabaseClient
): Promise<string> {
  // Defaults if tenant config/table not present
  let arrivalGraceMin = 240; // 4h
  let departureGraceMin = 480; // 8h
  let defaultGroup = 'Self Park'; // Default group

  // Try load per-tenant ANPR config (safe fallback if table not exists)
  try {
    const { data: cfg, error: cfgErr } = await adminClient
      .from('tenant_anpr_config')
      .select('arrival_grace_minutes,departure_grace_minutes,default_group')
      .eq('tenant_id', tenantId)
      .maybeSingle<TenantAnprConfig>();

    if (!cfgErr && cfg) {
      if (typeof cfg.arrival_grace_minutes === 'number') arrivalGraceMin = cfg.arrival_grace_minutes;
      if (typeof cfg.departure_grace_minutes === 'number') departureGraceMin = cfg.departure_grace_minutes;
      if (typeof cfg.default_group === 'string' && cfg.default_group) defaultGroup = cfg.default_group;
    }
  } catch {
    // ignore: table may not exist yet
  }

  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const todayEnd = endOfUtcDay(now);
  const tomorrow = addMinutes(todayStart, 24 * 60);
  const tomorrowEnd = endOfUtcDay(tomorrow);

  // We want bookings overlapping [today .. end of tomorrow], with grace applied
  const windowStart = addMinutes(todayStart, -arrivalGraceMin);
  const windowEnd = addMinutes(tomorrowEnd, departureGraceMin);

  // Fetch bookings for this tenant in the window
  const { data: bookings, error: bookingsErr } = await adminClient
    .from('bookings')
    .select('id, reference, plate, start_at, end_at, status')
    .eq('tenant_id', tenantId)
    .not('plate', 'is', null)
    .neq('plate', '')
    .gte('end_at', windowStart.toISOString()) // booking ends after window starts
    .lte('start_at', windowEnd.toISOString()); // booking starts before window ends

  if (bookingsErr) {
    throw new Error(`Failed to fetch bookings: ${bookingsErr.message}`);
  }

  // Filter out cancelled bookings defensively
  const rows =
    bookings
      ?.filter((b: any) => String(b.status || '').toLowerCase() !== 'cancelled')
      .map((b: any) => {
        const plate = normalizePlate(String(b.plate || ''));
        if (!plate) return null;

        const startAt = new Date(b.start_at);
        const endAt = new Date(b.end_at);

        // Apply grace windows to validity
        const validFrom = addMinutes(startAt, -arrivalGraceMin);
        const validUntil = addMinutes(endAt, departureGraceMin);

        // Use default_group from config
        const group = defaultGroup;

        return {
          Plate: plate,
          Group: group,
          'Valid From': formatUtc(validFrom),
          'Valid Until': formatUtc(validUntil),
        };
      })
      .filter(Boolean) ?? [];

  // Build CSV (RFC4180-ish, quote only when needed)
  const header = ['Plate', 'Group', 'Valid From', 'Valid Until'];
  const escapeCsv = (v: string) => {
    if (/[,"\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };

  const csvLines = [
    header.join(','),
    ...rows.map((r: any) => header.map((h) => escapeCsv(String(r[h] ?? ''))).join(',')),
  ];

  return csvLines.join('\r\n');
}
