import { parseSupplierDateTimeToUtc } from '@/lib/datetime/parse';
import type { CavuBooking } from '../cavu';
import {
  buildHealPatch,
  buildSyncPatch,
  mapCavuBooking,
  mapCavuStatus,
  resolveStatusForExisting,
} from '../cavuBookingMapper';

const NOW = new Date('2026-10-25T12:00:00.000Z');
const TENANT = 'tenant-1';

function booking(overrides: Partial<CavuBooking> = {}): CavuBooking {
  return {
    Reference: 'PC123',
    ArrivalDate: '2026-07-10T08:30:00Z',
    DepartureDate: '2026-07-17T18:45:00Z',
    Status: 'CONFIRMED',
    OutboundFlight: 'BA123',
    ReturnFlight: 'BA124',
    ReturningFrom: 'Malaga',
    OutboundTerminal: 'T5',
    ReturnTerminal: 'T5',
    AmountPaid: 64.5,
    Customer: { FirstName: 'Jo', Surname: 'Bloggs', Email: 'jo@example.com', Mobile: '07700900000' },
    Vehicle: { Registration: 'ab12 cde', Make: 'Ford', Model: 'Focus', Colour: 'Blue' },
    SpecialRequests: 'None',
    ...overrides,
  };
}

// Verbatim copy of the row the events sync built before the shared mapper existed.
function legacyEventsSyncRow(b: CavuBooking, tenantId: string, now: Date) {
  const customerName = `${b.Customer?.FirstName ?? ''} ${b.Customer?.Surname ?? ''}`.trim() || 'Unknown';
  const plate = (b.Vehicle?.Registration ?? '').replace(/\s+/g, '').toUpperCase() || 'UNKNOWN';
  const map = (s?: string) => {
    switch ((s || '').toUpperCase()) {
      case 'CONFIRMED': return 'reserved';
      case 'COMPLETED': return 'checked_out';
      case 'CANCELLED': return 'cancelled';
      case 'NOSHOW': return 'cancelled';
      default: return 'reserved';
    }
  };
  const missing: string[] = [];
  if (!customerName || customerName === 'Unknown') missing.push('customer_name');
  if (!plate || plate === 'UNKNOWN') missing.push('plate');
  if (!b.Customer?.Email || b.Customer.Email.trim() === '') missing.push('customer_email');
  if (!b.ArrivalDate || b.ArrivalDate.trim() === '') missing.push('start_at');
  if (!b.DepartureDate || b.DepartureDate.trim() === '') missing.push('end_at');
  return {
    tenant_id: tenantId,
    reference: b.Reference,
    external_source: 'cavu',
    start_at: parseSupplierDateTimeToUtc(b.ArrivalDate) ?? b.ArrivalDate,
    end_at: parseSupplierDateTimeToUtc(b.DepartureDate) ?? b.DepartureDate,
    customer_name: customerName,
    customer_email: b.Customer?.Email ?? null,
    customer_phone: b.Customer?.Mobile ?? null,
    plate,
    car_make: b.Vehicle?.Make ?? null,
    car_model: b.Vehicle?.Model ?? null,
    car_color: b.Vehicle?.Colour ?? null,
    flight_number: b.OutboundFlight ?? null,
    return_flight_number: b.ReturnFlight ?? null,
    returning_from: b.ReturningFrom ?? null,
    outbound_terminal: b.OutboundTerminal ?? null,
    return_terminal: b.ReturnTerminal ?? null,
    flight_date: b.ArrivalDate ? b.ArrivalDate.slice(0, 10) : null,
    source: 'cavu',
    status: map(b.Status),
    money_received: b.AmountPaid ?? 0,
    money_charged: b.AmountPaid ?? 0,
    notes: b.SpecialRequests ?? null,
    is_incomplete: missing.length > 0,
    missing_fields: missing,
    updated_at: now.toISOString(),
  };
}

const map = (b: CavuBooking) => mapCavuBooking(b, { tenantId: TENANT, timezone: 'Europe/London', now: NOW });

describe('mapCavuBooking', () => {
  it('produces exactly the row the events sync used to write for normal bookings', () => {
    for (const b of [
      booking(),
      booking({ Status: 'COMPLETED', ArrivalDate: '2026-11-02T05:00:00Z', DepartureDate: '2026-11-09T22:15:00Z' }),
      booking({ Status: 'CANCELLED', Customer: { FirstName: 'A', Surname: 'B' } }),
    ]) {
      expect(map(b).row).toEqual(legacyEventsSyncRow(b, TENANT, NOW));
    }
  });

  it('treats a BST "Z" time as car-park local (08:30 BST = 07:30 UTC)', () => {
    const { row } = map(booking());
    expect(row.start_at).toBe('2026-07-10T07:30:00.000Z');
    expect(row.end_at).toBe('2026-07-17T17:45:00.000Z');
    expect(row.flight_date).toBe('2026-07-10');
  });

  it('treats a GMT time after the 25 Oct 2026 clock change as UTC+0', () => {
    const { row } = map(booking({ ArrivalDate: '2026-10-26T08:30:00Z', DepartureDate: '2026-10-25T01:30:00Z' }));
    expect(row.start_at).toBe('2026-10-26T08:30:00.000Z');
    // 01:30 local on 25 Oct is after the 02:00 BST → 01:00 GMT fallback, so GMT.
    expect(row.end_at).toBe('2026-10-25T01:30:00.000Z');
  });

  it('uses the tenant timezone passed in', () => {
    const { row } = mapCavuBooking(booking(), { tenantId: TENANT, timezone: 'UTC', now: NOW });
    expect(row.start_at).toBe('2026-07-10T08:30:00.000Z');
  });

  it('throws RangeError for an impossible date so the caller can skip the event', () => {
    expect(() => map(booking({ ArrivalDate: '2026-13-45T25:99:00Z' }))).toThrow(RangeError);
  });

  it('parses AmountPaid with parseMoney and reports a missing amount as null', () => {
    expect(map(booking({ AmountPaid: '£1,234.50' as any })).amountPaid).toBe(1234.5);
    const missing = map(booking({ AmountPaid: undefined }));
    expect(missing.amountPaid).toBeNull();
    expect(missing.row.money_charged).toBe(0); // brand-new rows still insert 0 as before
  });
});

describe('mapCavuStatus', () => {
  it('maps exact values only', () => {
    expect(mapCavuStatus('CONFIRMED')).toBe('reserved');
    expect(mapCavuStatus('amend')).toBe('reserved');
    expect(mapCavuStatus('COMPLETED')).toBe('checked_out');
    expect(mapCavuStatus('CANCELLED')).toBe('cancelled');
    expect(mapCavuStatus('NOSHOW')).toBe('cancelled');
    expect(mapCavuStatus('PENDING')).toBeNull(); // used to become checked_in via includes('IN')
    expect(mapCavuStatus('CHECKOUT_PENDING')).toBeNull();
    expect(mapCavuStatus(undefined)).toBeNull();
  });
});

describe('existing bookings', () => {
  const existing = {
    id: 'b1',
    status: 'checked_in',
    money_charged: 64.5,
    money_received: 64.5,
    start_at: '2026-07-10T07:30:00+00:00',
    end_at: '2026-07-17T17:45:00+00:00',
    customer_name: 'Jo Bloggs',
    customer_email: 'jo@example.com',
    plate: 'AB12CDE',
  };

  it('never moves a checked_in / checked_out car back to reserved', () => {
    expect(resolveStatusForExisting('checked_in', 'reserved')).toBeUndefined();
    expect(resolveStatusForExisting('checked_out', 'reserved')).toBeUndefined();
    expect(resolveStatusForExisting('checked_in', 'checked_out')).toBeUndefined();
    const patch = buildSyncPatch(map(booking({ Status: 'AMEND' })), existing);
    expect(patch).not.toHaveProperty('status');
    for (const k of ['gate_status', 'ops_status', 'anpr_status']) expect(patch).not.toHaveProperty(k);
  });

  it('applies CAVU cancellations even to an operational booking', () => {
    expect(resolveStatusForExisting('checked_in', 'cancelled')).toBe('cancelled');
    expect(buildSyncPatch(map(booking({ Status: 'CANCELLED' })), existing).status).toBe('cancelled');
    expect(resolveStatusForExisting('cancelled', 'cancelled')).toBeUndefined();
  });

  it('updates a reserved booking from CAVU and ignores unknown statuses', () => {
    expect(resolveStatusForExisting('reserved', 'checked_out')).toBe('checked_out');
    expect(resolveStatusForExisting('cancelled', 'reserved')).toBe('reserved');
    expect(resolveStatusForExisting('cancelled', null)).toBeUndefined();
  });

  it('does not overwrite money when AmountPaid is missing', () => {
    const patch = buildSyncPatch(map(booking({ AmountPaid: undefined })), existing);
    expect(patch).not.toHaveProperty('money_charged');
    expect(patch).not.toHaveProperty('money_received');
    expect(buildSyncPatch(map(booking({ AmountPaid: 70 })), existing).money_charged).toBe(70);
  });

  it('does not blank existing details or rewrite identical times', () => {
    const patch = buildSyncPatch(map(booking({ Customer: {}, Vehicle: {} })), existing);
    expect(patch).not.toHaveProperty('customer_name');
    expect(patch).not.toHaveProperty('customer_email');
    expect(patch).not.toHaveProperty('plate');
    expect(patch).not.toHaveProperty('start_at');
    expect(patch.is_incomplete).toBe(false);
  });

  it('heal only fills blanks and returns null when it has nothing to add', () => {
    const incomplete = { ...existing, customer_email: null, start_at: '2026-07-10T09:00:00+00:00' };
    const patch = buildHealPatch(map(booking({ Status: 'CONFIRMED', AmountPaid: 1 })), incomplete)!;
    expect(patch.customer_email).toBe('jo@example.com');
    expect(patch).not.toHaveProperty('start_at');
    expect(patch).not.toHaveProperty('status');
    expect(patch).not.toHaveProperty('money_charged');
    expect(patch.is_incomplete).toBe(false);

    const stillNoEmail = buildHealPatch(
      map(booking({ Customer: { FirstName: 'Jo', Surname: 'Bloggs' } })),
      { ...incomplete, car_make: 'Ford', car_model: 'Focus', car_color: 'Blue', customer_phone: '1',
        flight_number: 'x', return_flight_number: 'x', returning_from: 'x', outbound_terminal: 'x',
        return_terminal: 'x', flight_date: '2026-07-10', notes: 'x' }
    );
    expect(stillNoEmail).toBeNull();
  });
});
