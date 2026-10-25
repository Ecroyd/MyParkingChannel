import { classifyCavuError, decideCavuCursor, CavuEventOutcome } from '../cavuCursor';

const started = new Date('2026-07-10T12:00:00.000Z');
const prev = '2026-07-10T10:00:00.000Z';
const ev = (status: CavuEventOutcome['status'], eventDate: string | null = '2026-07-10T12:30:00Z'): CavuEventOutcome => ({
  reference: 'PC1',
  eventDate,
  status,
});

describe('decideCavuCursor', () => {
  it('does not move when the event list fetch failed / was not an array', () => {
    expect(decideCavuCursor({ fetchOk: false, fetchStartedAt: started, previousCursor: prev, outcomes: [] }).advance).toBe(false);
  });

  it('moves to the fetch start when there are no events', () => {
    expect(decideCavuCursor({ fetchOk: true, fetchStartedAt: started, previousCursor: prev, outcomes: [] }))
      .toMatchObject({ advance: true, cursor: started.toISOString() });
  });

  it('moves past successes and permanent failures', () => {
    const d = decideCavuCursor({ fetchOk: true, fetchStartedAt: started, previousCursor: prev, outcomes: [ev('ok'), ev('permanent'), ev('permanent', null)] });
    expect(d).toMatchObject({ advance: true, cursor: started.toISOString() });
  });

  it('holds the cursor before the earliest transient failure (local EventDate, 1h margin)', () => {
    const d = decideCavuCursor({
      fetchOk: true,
      fetchStartedAt: started,
      previousCursor: '2026-07-10T08:00:00.000Z',
      outcomes: [ev('ok', '2026-07-10T11:50:00Z'), ev('transient', '2026-07-10T11:30:00Z'), ev('transient', '2026-07-10T11:45:00Z')],
      timezone: 'Europe/London',
    });
    // 11:30 BST = 10:30 UTC, minus 1h margin.
    expect(d).toMatchObject({ advance: true, cursor: '2026-07-10T09:30:00.000Z' });
  });

  it('does not move when the transient failure is at/behind the current cursor', () => {
    const d = decideCavuCursor({ fetchOk: true, fetchStartedAt: started, previousCursor: prev, outcomes: [ev('transient', '2026-07-10T11:30:00Z')] });
    expect(d.advance).toBe(false);
  });

  it('does not move when a transient failure has no readable EventDate', () => {
    const d = decideCavuCursor({ fetchOk: true, fetchStartedAt: started, previousCursor: null, outcomes: [ev('transient', 'garbage')] });
    expect(d.advance).toBe(false);
  });
});

describe('classifyCavuError', () => {
  it('treats rate limits, 5xx and network errors as transient', () => {
    expect(classifyCavuError(Object.assign(new Error('CAVU request failed: 429 slow down'), { code: 'CAVU_RATE_LIMIT' }))).toBe('transient');
    expect(classifyCavuError(new Error('CAVU request failed: 503 unavailable'))).toBe('transient');
    expect(classifyCavuError(new TypeError('fetch failed'))).toBe('transient');
    expect(classifyCavuError({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe('transient');
  });

  it('treats 4xx, invalid dates and Postgres data errors as permanent', () => {
    expect(classifyCavuError(new Error('CAVU request failed: 404 not found'))).toBe('permanent');
    expect(classifyCavuError(new RangeError('Invalid time value'))).toBe('permanent');
    expect(classifyCavuError({ code: '22007', message: 'invalid input syntax for type timestamp' })).toBe('permanent');
    expect(classifyCavuError({ code: '23502', message: 'null value violates not-null constraint' })).toBe('permanent');
  });
});
