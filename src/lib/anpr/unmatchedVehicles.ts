// src/lib/anpr/unmatchedVehicles.ts
//
// Cars the ANPR cameras saw that matched no booking and aren't staff ("rogue cars"), grouped by
// plate for the dashboard card (GET /api/admin/anpr/unmatched).

export type UnmatchedRead = {
  id: string;
  event_at: string;
  direction: string | null;
  plate: string | null;
  plate_norm: string | null;
  raw_payload: unknown;
};

export type UnmatchedVehicle = {
  plate: string;
  reads: number;
  ins: number;
  outs: number;
  firstSeen: string;
  lastSeen: string;
  lastDirection: 'in' | 'out' | null;
  lastEventId: string;
  make: string | null;
  colour: string | null;
};

/** raw_payload is stored as JSON text by /capture, or as an object by older writers. */
function rawFields(raw: unknown): Record<string, unknown> {
  let value = raw;
  for (let i = 0; i < 2 && typeof value === 'string'; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function tidy(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || /^(unknown|other|0)$/i.test(v)) return null;
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();
}

export function normalisePlate(plate: string | null | undefined): string {
  return (plate ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export type DismissedPlate = { plate_norm: string; dismissed_at: string };

/**
 * One row per plate, most recently seen first. Reads for `excludePlates` (staff) are dropped, and
 * so are reads of a dismissed plate up to the moment it was dismissed (a later visit shows again).
 */
export function groupUnmatchedReads(
  rows: UnmatchedRead[],
  excludePlates: Iterable<string> = [],
  dismissed: Iterable<DismissedPlate> = []
): UnmatchedVehicle[] {
  const exclude = new Set([...excludePlates].map(normalisePlate));
  const dismissedAt = new Map<string, number>();
  for (const d of dismissed) dismissedAt.set(normalisePlate(d.plate_norm), Date.parse(d.dismissed_at));
  const byPlate = new Map<string, UnmatchedVehicle>();

  for (const r of rows) {
    const plate = normalisePlate(r.plate_norm || r.plate);
    if (!plate || exclude.has(plate)) continue;
    const until = dismissedAt.get(plate);
    if (until !== undefined && Date.parse(r.event_at) <= until) continue;
    const direction = r.direction === 'in' || r.direction === 'out' ? r.direction : null;
    const raw = rawFields(r.raw_payload);

    let v = byPlate.get(plate);
    if (!v) {
      v = {
        plate,
        reads: 0,
        ins: 0,
        outs: 0,
        firstSeen: r.event_at,
        lastSeen: r.event_at,
        lastDirection: direction,
        lastEventId: r.id,
        make: null,
        colour: null,
      };
      byPlate.set(plate, v);
    }
    v.reads++;
    if (direction === 'in') v.ins++;
    if (direction === 'out') v.outs++;
    if (r.event_at < v.firstSeen) v.firstSeen = r.event_at;
    if (r.event_at >= v.lastSeen) {
      v.lastSeen = r.event_at;
      v.lastDirection = direction;
      v.lastEventId = r.id;
    }
    v.make ??= tidy(raw.vehicleLogo);
    v.colour ??= tidy(raw.vehicleColor);
  }

  return [...byPlate.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
