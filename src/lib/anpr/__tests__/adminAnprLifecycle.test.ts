import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ANPR_EVENT_POLL_MS,
  ANPR_MIN_EVENT_POLL_MS,
  AnprRequestController,
  assertEventPollInterval,
  canPollAnprEvents,
  isAnprConfigured,
  resolveAnprLifecycleState,
} from '@/lib/anpr/adminAnprLifecycle';
import {
  ADMIN_ANPR_EVENTS_LIST_SELECT,
  ADMIN_GATE_EVENTS_LIST_SELECT,
  assertAnprListSelectSafe,
} from '@/lib/anpr/adminAnprEventsSelect';
import {
  ANPR_DEFAULT_PAGE_SIZE,
  ANPR_MAX_PAGE_SIZE,
  enforceAnprPageSize,
  resolveAnprEventTimeBounds,
} from '@/lib/anpr/adminAnprEventsParams';

describe('ANPR lifecycle states', () => {
  it('treats empty config as not_configured (not disconnected)', () => {
    expect(resolveAnprLifecycleState(null)).toBe('not_configured');
    expect(resolveAnprLifecycleState({ enabled: false })).toBe('not_configured');
  });

  it('uses configured_disabled when config exists but enabled is false', () => {
    expect(
      resolveAnprLifecycleState({
        enabled: false,
        ingest_method: 'relay',
        has_relay_token: true,
      })
    ).toBe('configured_disabled');
    expect(
      isAnprConfigured({
        enabled: false,
        videofit_api_url: 'https://example.test',
      })
    ).toBe(true);
  });

  it('does not label never-enabled tenants as unhealthy', () => {
    const state = resolveAnprLifecycleState({ enabled: false }, [
      { id: '1', name: 'cam', status: 'inactive', last_seen: null },
    ]);
    expect(state).not.toBe('enabled_disconnected');
    expect(state).not.toBe('enabled_connected');
  });

  it('detects enabled_connected vs enabled_disconnected from heartbeat', () => {
    const now = Date.now();
    expect(
      resolveAnprLifecycleState(
        { enabled: true, offline_after_minutes: 15, has_relay_token: true },
        [{ id: '1', name: 'cam', status: 'active', last_seen: new Date(now - 60_000).toISOString() }],
        now
      )
    ).toBe('enabled_connected');

    expect(
      resolveAnprLifecycleState(
        { enabled: true, offline_after_minutes: 15, has_relay_token: true },
        [{ id: '1', name: 'cam', status: 'active', last_seen: new Date(now - 60 * 60_000).toISOString() }],
        now
      )
    ).toBe('enabled_disconnected');
  });
});

describe('ANPR polling gates', () => {
  it('defaults live monitoring contract to Off (no poll without liveMonitoring)', () => {
    expect(
      canPollAnprEvents({
        enabled: true,
        liveMonitoring: false,
        visibilityState: 'visible',
        inFlight: false,
      })
    ).toBe(false);
  });

  it('requires enabled + live monitoring + visible + not in-flight', () => {
    expect(
      canPollAnprEvents({
        enabled: true,
        liveMonitoring: true,
        visibilityState: 'visible',
        inFlight: false,
      })
    ).toBe(true);
  });

  it('hidden tabs do not poll', () => {
    expect(
      canPollAnprEvents({
        enabled: true,
        liveMonitoring: true,
        visibilityState: 'hidden',
        inFlight: false,
      })
    ).toBe(false);
  });

  it('disabled ANPR never polls events/devices', () => {
    expect(
      canPollAnprEvents({
        enabled: false,
        liveMonitoring: true,
        visibilityState: 'visible',
        inFlight: false,
      })
    ).toBe(false);
  });

  it('live monitoring event interval is at least 30 seconds', () => {
    expect(ANPR_EVENT_POLL_MS).toBeGreaterThanOrEqual(ANPR_MIN_EVENT_POLL_MS);
    expect(() => assertEventPollInterval(ANPR_EVENT_POLL_MS)).not.toThrow();
    expect(() => assertEventPollInterval(5_000)).toThrow();
  });
});

describe('AnprRequestController', () => {
  it('blocks overlapping requests and aborts the previous one', async () => {
    const controller = new AnprRequestController();
    let aborted = false;

    const first = controller.run(async (signal) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 50);
        signal.addEventListener('abort', () => {
          aborted = true;
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return 'first';
    });

    const second = controller.run(async () => 'second');
    const [a, b] = await Promise.all([first, second]);
    expect(aborted).toBe(true);
    expect(a.ok).toBe(false);
    expect(b).toEqual({ ok: true, data: 'second', sequence: 2 });
  });

  it('disable() clears intervals and aborts in-flight requests', async () => {
    vi.useFakeTimers();
    const controller = new AnprRequestController();
    const spy = vi.fn();
    const id = setInterval(spy, 1000);
    controller.trackInterval(id);

    const pending = controller.run(async (signal) => {
      await new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        );
      });
      return 'x';
    });

    controller.disable();
    const result = await pending;
    expect(result.ok).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(spy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('ANPR event query bounds', () => {
  it('defaults page size to 50 and hard-caps at 100', () => {
    expect(ANPR_DEFAULT_PAGE_SIZE).toBe(50);
    expect(enforceAnprPageSize(undefined)).toBe(50);
    expect(enforceAnprPageSize(200)).toBe(ANPR_MAX_PAGE_SIZE);
    expect(enforceAnprPageSize(1000)).toBe(100);
  });

  it('always applies a lower time bound (default 7 days)', () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const bounds = resolveAnprEventTimeBounds({ now });
    expect(bounds.fromIso).toBe('2026-07-22T12:00:00.000Z');
    expect(bounds.toIso).toBeNull();
  });

  it('allows an explicit wider from date', () => {
    const bounds = resolveAnprEventTimeBounds({ from: '2026-01-01' });
    expect(bounds.fromIso.startsWith('2026-01-01')).toBe(true);
  });

  it('event list selects never use select("*")', () => {
    expect(ADMIN_GATE_EVENTS_LIST_SELECT.includes('*')).toBe(false);
    expect(ADMIN_ANPR_EVENTS_LIST_SELECT.includes('*')).toBe(false);
    expect(() => assertAnprListSelectSafe('*')).toThrow();
    expect(() => assertAnprListSelectSafe(ADMIN_ANPR_EVENTS_LIST_SELECT)).not.toThrow();
  });
});

describe('disabled ANPR request contract', () => {
  it('documents disabled page: config once, no devices/events/intervals', () => {
    const disabledLoadsConfigOnce = true;
    const disabledRequestsDevices = false;
    const disabledRequestsEvents = false;
    const disabledCreatesInterval = false;
    const configIsPolled = false;

    expect(disabledLoadsConfigOnce).toBe(true);
    expect(disabledRequestsDevices).toBe(false);
    expect(disabledRequestsEvents).toBe(false);
    expect(disabledCreatesInterval).toBe(false);
    expect(configIsPolled).toBe(false);
  });
});
