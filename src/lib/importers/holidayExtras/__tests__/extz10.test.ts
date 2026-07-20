import { describe, it, expect } from 'vitest';
import { parseHolidayExtrasExtz10Text, looksLikeExtz10Tab } from '../parseHolidayExtras';

describe('Holiday Extras EXTZ10 Parser', () => {
  const sampleRow = '06\t1\tKXBZFQ\tMATTHEWSON\t260927\tMRS\tL\t2\t0400\t261005\tEXTPIM\tLP\t0000105.32\tN\t1330\tDS62WXZ\t8\tVAUXHALL\tINSIGNIA\tGREY\t07454012123\t0\t0';
  const amendmentRow = '06\t2\tKXBZFQ\tMATTHEWSON\t260927\tMRS\tL\t2\t0500\t261005\tEXTPIM\tLP\t0000120.00\tN\t1330\tDS62WXZ\t8\tVAUXHALL\tINSIGNIA\tGREY\t07454012123\t0\t0';
  const cancellationRow = '06\t3\tKXBZFQ\tMATTHEWSON\t260927\tMRS\tL\t2\t0400\t261005\tEXTPIM\tLP\t0000105.32\tN\t1330\tDS62WXZ\t8\tVAUXHALL\tINSIGNIA\tGREY\t07454012123\t0\t0';

  it('should detect EXTZ10 format', () => {
    expect(looksLikeExtz10Tab('extz10.txt', sampleRow)).toBe(true);
  });

  it('should parse action code 1 (new booking)', () => {
    const result = parseHolidayExtrasExtz10Text(sampleRow);
    
    expect(result.bookings).toHaveLength(1);
    const booking = result.bookings[0];
    
    expect(booking.booking_reference).toBe('KXBZFQ');
    expect(booking.customer_lastname).toBe('MATTHEWSON');
    expect(booking.vehicle_registration).toBe('DS62WXZ');
    expect(booking.vehicle_make).toBe('VAUXHALL');
    expect(booking.vehicle_model).toBe('INSIGNIA');
    expect(booking.vehicle_colour).toBe('GREY');
    expect(booking.customer_phone).toBe('07454012123');
    expect(booking.total_price).toBe(105.32);
    expect(booking.money_charged).toBe(105.32);
    expect(booking.product_code).toBe('EXTPIM');
    expect(booking.raw?.external_status).toBe('new');
    expect(booking.raw?.mapped_status).toBe('reserved');
  });

  it('should add one day to hotel night date for arrival', () => {
    const result = parseHolidayExtrasExtz10Text(sampleRow);
    const booking = result.bookings[0];
    
    // Hotel night: 260927 (27 Sep 2026)
    // Arrival: 28 Sep 2026 at 04:00
    expect(booking.start_at).toBe('2026-09-28T04:00:00');
  });

  it('should parse departure date correctly', () => {
    const result = parseHolidayExtrasExtz10Text(sampleRow);
    const booking = result.bookings[0];
    
    // Departure: 261005 (5 Oct 2026) at 13:30
    expect(booking.end_at).toBe('2026-10-05T13:30:00');
  });

  it('should handle action code 2 (amendment)', () => {
    const result = parseHolidayExtrasExtz10Text(amendmentRow);
    
    expect(result.bookings).toHaveLength(1);
    const booking = result.bookings[0];
    
    expect(booking.booking_reference).toBe('KXBZFQ');
    expect(booking.raw?.external_status).toBe('amended');
    expect(booking.raw?.mapped_status).toBe('reserved');
    expect(booking.start_at).toBe('2026-09-28T05:00:00'); // Changed arrival time
    expect(booking.total_price).toBe(120); // Changed price
  });

  it('should handle action code 3 (cancellation)', () => {
    const result = parseHolidayExtrasExtz10Text(cancellationRow);
    
    expect(result.bookings).toHaveLength(1);
    const booking = result.bookings[0];
    
    expect(booking.booking_reference).toBe('KXBZFQ');
    expect(booking.raw?.external_status).toBe('cancelled');
    expect(booking.raw?.mapped_status).toBe('cancelled');
  });

  it('should handle multiple rows', () => {
    const multipleRows = [sampleRow, amendmentRow, cancellationRow].join('\n');
    const result = parseHolidayExtrasExtz10Text(multipleRows);
    
    expect(result.bookings).toHaveLength(3);
    expect(result.stats.rows_accepted).toBe(3);
  });

  it('should skip rows with invalid action codes', () => {
    const invalidAction = '06\t9\tKXBZFQ\tMATTHEWSON\t260927\tMRS\tL\t2\t0400\t261005\tEXTPIM\tLP\t0000105.32\tN\t1330\tDS62WXZ\t8\tVAUXHALL\tINSIGNIA\tGREY\t07454012123\t0\t0';
    const result = parseHolidayExtrasExtz10Text(invalidAction);
    
    expect(result.bookings).toHaveLength(0);
    expect(result.stats.skipped_missing_status).toBe(1);
  });

  it('should skip rows without reference', () => {
    const noRef = '06\t1\t\tMATTHEWSON\t260927\tMRS\tL\t2\t0400\t261005\tEXTPIM\tLP\t0000105.32\tN\t1330\tDS62WXZ\t8\tVAUXHALL\tINSIGNIA\tGREY\t07454012123\t0\t0';
    const result = parseHolidayExtrasExtz10Text(noRef);
    
    expect(result.bookings).toHaveLength(0);
    expect(result.stats.skipped_missing_reference).toBe(1);
  });

  it('should skip rows with invalid hotel night date', () => {
    const badDate = '06\t1\tKXBZFQ\tMATTHEWSON\t269999\tMRS\tL\t2\t0400\t261005\tEXTPIM\tLP\t0000105.32\tN\t1330\tDS62WXZ\t8\tVAUXHALL\tINSIGNIA\tGREY\t07454012123\t0\t0';
    const result = parseHolidayExtrasExtz10Text(badDate);
    
    expect(result.bookings).toHaveLength(0);
    expect(result.stats.skipped_invalid_date).toBe(1);
  });

  it('should normalize plate registration', () => {
    const withSpaces = '06\t1\tKXBZFQ\tMATTHEWSON\t260927\tMRS\tL\t2\t0400\t261005\tEXTPIM\tLP\t0000105.32\tN\t1330\tDS62 WXZ\t8\tVAUXHALL\tINSIGNIA\tGREY\t07454012123\t0\t0';
    const result = parseHolidayExtrasExtz10Text(withSpaces);
    
    expect(result.bookings[0].vehicle_registration).toBe('DS62WXZ');
  });

  it('should parse money correctly', () => {
    const zeroPadded = '06\t1\tKXBZFQ\tMATTHEWSON\t260927\tMRS\tL\t2\t0400\t261005\tEXTPIM\tLP\t0000050.50\tN\t1330\tDS62WXZ\t8\tVAUXHALL\tINSIGNIA\tGREY\t07454012123\t0\t0';
    const result = parseHolidayExtrasExtz10Text(zeroPadded);
    
    expect(result.bookings[0].total_price).toBe(50.50);
  });

  it('should handle DST boundary correctly', () => {
    // Hotel night during DST transition (e.g., late March)
    const dstRow = '06\t1\tKXBZFQ\tMATTHEWSON\t260327\tMRS\tL\t2\t0400\t260330\tEXTPIM\tLP\t0000105.32\tN\t1330\tDS62WXZ\t8\tVAUXHALL\tINSIGNIA\tGREY\t07454012123\t0\t0';
    const result = parseHolidayExtrasExtz10Text(dstRow);
    
    const booking = result.bookings[0];
    // Hotel night: 27 March 2026 → Arrival: 28 March 2026
    expect(booking.start_at).toBe('2026-03-28T04:00:00');
    expect(booking.end_at).toBe('2026-03-30T13:30:00');
  });

  it('should include EXTZ10 metadata in notes', () => {
    const result = parseHolidayExtrasExtz10Text(sampleRow);
    const booking = result.bookings[0];
    
    expect(booking.notes).toContain('EXTZ10 import');
    expect(booking.notes).toContain('Passengers: 2');
  });

  it('should provide parse stats', () => {
    const multipleRows = [
      sampleRow,
      amendmentRow,
      '06\t9\tBOGUS\tSMITH\t260927\tMR\tJ\t1\t0800\t261001\tEXTPIM\tLP\t0000080.00\tN\t1200\tAB12CDE\t5\tFORD\tFOCUS\tBLUE\t07777888999\t0\t0', // invalid action
      'this is not a valid row',
    ].join('\n');
    
    const result = parseHolidayExtrasExtz10Text(multipleRows);
    
    expect(result.stats.total_lines).toBe(4);
    expect(result.stats.ext_rows_found).toBe(3);
    expect(result.stats.rows_accepted).toBe(2);
    expect(result.stats.skipped_missing_status).toBe(1);
    expect(result.stats.skipped_unknown_format).toBe(1);
  });
});
