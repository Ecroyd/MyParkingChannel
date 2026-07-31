import {
  exportChannel,
  exportDateRangeUtcBounds,
  exportStayDays,
  formatExportDateTime,
  money2,
} from '../accountingExportFormat';

describe('accountingExportFormat', () => {
  test('exportChannel prefers external_source once', () => {
    expect(
      exportChannel({ source: 'holiday_extras', external_source: 'holiday_extras' }),
    ).toBe('holiday_extras');
    expect(exportChannel({ source: 'direct', external_source: null })).toBe('direct');
    expect(exportChannel({ source: null, external_source: null })).toBe('other');
  });

  test('formatExportDateTime uses London local wall time', () => {
    // 2026-06-01 03:00 UTC = 04:00 BST
    expect(formatExportDateTime('2026-06-01T03:00:00+00:00', 'Europe/London')).toBe(
      '01/06/2026 04:00',
    );
  });

  test('exportStayDays counts inclusive calendar days', () => {
    expect(
      exportStayDays(
        '2026-06-01T03:00:00+00:00',
        '2026-06-08T13:00:00+00:00',
        'Europe/London',
      ),
    ).toBe(8);
  });

  test('exportDateRangeUtcBounds covers full London calendar days', () => {
    const { fromUtc, toUtcExclusive } = exportDateRangeUtcBounds(
      '2026-06-01',
      '2026-06-01',
      'Europe/London',
    );
    // BST: midnight 1 Jun London = 2026-05-31T23:00:00.000Z
    expect(fromUtc).toBe('2026-05-31T23:00:00.000Z');
    expect(toUtcExclusive).toBe('2026-06-01T23:00:00.000Z');
  });

  test('money2 formats to 2dp', () => {
    expect(money2(151.44)).toBe('151.44');
    expect(money2(null)).toBe('0.00');
  });
});
