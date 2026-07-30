// components/admin/anpr/AnprAdminClient.tsx

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnprRequestController,
  ANPR_DEVICE_POLL_MS,
  ANPR_EVENT_POLL_MS,
  assertEventPollInterval,
  canPollAnprDevices,
  canPollAnprEvents,
  resolveAnprLifecycleState,
  type AnprLifecycleState,
} from '@/lib/anpr/adminAnprLifecycle';
import { ANPR_DEFAULT_LOOKBACK_DAYS } from '@/lib/anpr/adminAnprEventsParams';
import {
  AnprSettingsPanel,
  GateDevicesPanel,
  SnapRelayPanel,
  type AnprConfig,
} from './AnprSettingsPanels';

type GateEvent = {
  id: string;
  event_at: string;
  mode: string;
  plate: string | null;
  qr_code: string | null;
  result: string;
  reason: string | null;
  device_name: string;
  booking_reference: string | null;
  booking_status: string | null;
};

type GateDevice = {
  id: string;
  name: string;
  kind: string;
  status: string;
  last_seen: string | null;
};

type Props = {
  tenantId: string;
};

type View = 'overview' | 'events' | 'configure' | 'snap-relay' | 'devices';

function addDaysIsoDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function providerLabel(config: AnprConfig | null): string {
  if (!config) return 'Not configured';
  if (config.videofit_api_url || config.videofit_base_url || config.videofit_mode) {
    return 'Videofit / Snap';
  }
  if (config.ingest_method) return config.ingest_method;
  if (config.has_relay_token) return 'Local relay';
  return 'Not configured';
}

function lifecycleLabel(state: AnprLifecycleState): string {
  switch (state) {
    case 'not_configured':
      return 'Not enabled';
    case 'configured_disabled':
      return 'Configured · disabled';
    case 'enabled_disconnected':
      return 'Enabled · disconnected';
    case 'enabled_connected':
      return 'Enabled · connected';
  }
}

export default function AnprAdminClient({ tenantId }: Props) {
  const [view, setView] = useState<View>('overview');
  const [config, setConfig] = useState<AnprConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [devices, setDevices] = useState<GateDevice[]>([]);
  const [events, setEvents] = useState<GateEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  // Live monitoring defaults to Off on every page visit
  const [liveMonitoring, setLiveMonitoring] = useState(false);

  const [fromDate, setFromDate] = useState(() => addDaysIsoDate(-ANPR_DEFAULT_LOOKBACK_DAYS));
  const [toDate, setToDate] = useState(() => addDaysIsoDate(0));

  const eventsController = useRef(new AnprRequestController());
  const devicesController = useRef(new AnprRequestController());
  const enabled = Boolean(config?.enabled);

  const lifecycle = useMemo(
    () => resolveAnprLifecycleState(config, devices),
    [config, devices]
  );

  const loadAnprConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const res = await fetch(`/api/admin/anpr/config?tenantId=${encodeURIComponent(tenantId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load ANPR config');
      }
      const data = (await res.json()) as { config: AnprConfig };
      setConfig(data.config);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setConfigLoading(false);
    }
  }, [tenantId]);

  const loadDeviceHealth = useCallback(async () => {
    if (!enabled) return;
    setDevicesLoading(true);
    try {
      const result = await devicesController.current.run(async (signal) => {
        const res = await fetch(
          `/api/admin/gate-devices?tenantId=${encodeURIComponent(tenantId)}`,
          { signal, cache: 'no-store' }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load devices');
        }
        return (await res.json()) as { devices: GateDevice[] };
      });
      if (result.ok) setDevices(result.data.devices || []);
    } catch (err) {
      console.error(err);
    } finally {
      setDevicesLoading(false);
    }
  }, [tenantId, enabled]);

  const loadRecentEvents = useCallback(async () => {
    if (!enabled) return;
    setEventsLoading(true);
    setEventsError(null);
    try {
      const result = await eventsController.current.run(async (signal) => {
        const params = new URLSearchParams({
          tenantId,
          from: fromDate,
          to: toDate,
          limit: '50',
        });
        const res = await fetch(`/api/admin/gate-events?${params}`, {
          signal,
          cache: 'no-store',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load events');
        }
        return (await res.json()) as { events: GateEvent[] };
      });
      if (!result.ok) return;
      setEvents(result.data.events || []);
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setEventsLoading(false);
    }
  }, [tenantId, enabled, fromDate, toDate]);

  // Config once on page load — the only request when ANPR is disabled
  useEffect(() => {
    void loadAnprConfig();
    return () => {
      eventsController.current.disable();
      devicesController.current.disable();
    };
  }, [loadAnprConfig]);

  // When disabled: stop all timers and abort in-flight event/device requests
  useEffect(() => {
    if (!enabled) {
      setLiveMonitoring(false);
      eventsController.current.disable();
      devicesController.current.disable();
      setEvents([]);
      setDevices([]);
    }
  }, [enabled]);

  // When enabled: load devices + events once (no polling unless live monitoring)
  useEffect(() => {
    if (!enabled) return;
    void loadDeviceHealth();
    void loadRecentEvents();
  }, [enabled, loadDeviceHealth, loadRecentEvents]);

  // Live monitoring intervals — events ≥30s, devices ≥60s; pause when hidden
  useEffect(() => {
    eventsController.current.clearIntervals();
    devicesController.current.clearIntervals();

    if (!enabled || !liveMonitoring) return;

    assertEventPollInterval(ANPR_EVENT_POLL_MS);

    const eventId = setInterval(() => {
      if (
        canPollAnprEvents({
          enabled,
          liveMonitoring,
          visibilityState: document.visibilityState,
          inFlight: eventsController.current.inFlight,
        })
      ) {
        void loadRecentEvents();
      }
    }, ANPR_EVENT_POLL_MS);
    eventsController.current.trackInterval(eventId);

    const deviceId = setInterval(() => {
      if (
        canPollAnprDevices({
          enabled,
          liveMonitoring,
          visibilityState: document.visibilityState,
          inFlight: devicesController.current.inFlight,
        })
      ) {
        void loadDeviceHealth();
      }
    }, ANPR_DEVICE_POLL_MS);
    devicesController.current.trackInterval(deviceId);

    return () => {
      eventsController.current.clearIntervals();
      devicesController.current.clearIntervals();
    };
  }, [enabled, liveMonitoring, loadRecentEvents, loadDeviceHealth]);

  const lastEventLabel = events[0]?.event_at
    ? new Date(events[0].event_at).toLocaleString()
    : 'None';

  const cameraCount = devices.filter((d) => d.kind === 'anpr' || d.status === 'active').length;

  if (configLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">ANPR / Gate Control</h1>
        <p className="text-sm text-gray-600">Loading configuration…</p>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-2xl font-semibold">ANPR / Gate Control</h1>
        <p className="text-sm text-red-600">{configError}</p>
        <button
          type="button"
          onClick={() => void loadAnprConfig()}
          className="text-sm border px-3 py-1.5 rounded hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  // Dormant: not enabled — no live tables, no polls, no outage banners
  if (!enabled && view === 'overview') {
    return (
      <div className="p-6 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">ANPR / Gate Control</h1>
          <p className="text-sm text-gray-600">
            Vehicle recognition stays off until you connect a provider for this site.
          </p>
        </header>

        <div className="border border-gray-200 rounded-xl bg-white p-6 max-w-2xl space-y-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">ANPR is not connected</h2>
            <p className="text-sm text-gray-600 mt-2">
              Connect an ANPR provider or local relay when you are ready to begin receiving
              vehicle events.
            </p>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <dt className="text-xs text-gray-500">Status</dt>
              <dd className="font-medium">{lifecycleLabel(lifecycle)}</dd>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <dt className="text-xs text-gray-500">Provider</dt>
              <dd className="font-medium">{providerLabel(config)}</dd>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <dt className="text-xs text-gray-500">Cameras</dt>
              <dd className="font-medium">0 connected</dd>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <dt className="text-xs text-gray-500">Last event</dt>
              <dd className="font-medium">None</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setView('configure')}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Configure ANPR
            </button>
            <a
              href="https://docs.myparkingchannel.app/anpr"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 border text-sm rounded hover:bg-gray-50"
            >
              View integration guide
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">ANPR / Gate Control</h1>
          <p className="text-sm text-gray-600">
            {enabled
              ? 'Monitor vehicle events and manage ANPR configuration for this tenant.'
              : 'Configure ANPR for this tenant. Live monitoring stays off until enabled.'}
          </p>
        </div>
        <div className="text-xs text-gray-500">
          Status:{' '}
          <span className="font-medium text-gray-800">{lifecycleLabel(lifecycle)}</span>
        </div>
      </header>

      <div className="border-b border-gray-200 flex flex-wrap items-center gap-4">
        {enabled && (
          <>
            <button
              type="button"
              onClick={() => setView('events')}
              className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
                view === 'events' || view === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600'
              }`}
            >
              Gate Events
            </button>
            <button
              type="button"
              onClick={() => setView('devices')}
              className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
                view === 'devices' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600'
              }`}
            >
              Devices
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setView('configure')}
          className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
            view === 'configure' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600'
          }`}
        >
          Configure ANPR
        </button>
        <button
          type="button"
          onClick={() => setView('snap-relay')}
          className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
            view === 'snap-relay' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600'
          }`}
        >
          Snap Relay
        </button>
        {!enabled && (
          <button
            type="button"
            onClick={() => setView('overview')}
            className="pb-2 text-sm text-gray-500 border-b-2 border-transparent -mb-px"
          >
            ← Back to overview
          </button>
        )}
      </div>

      {enabled && (view === 'events' || view === 'overview') && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
              <input
                type="date"
                className="border rounded px-2 py-1 text-sm"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
              <input
                type="date"
                className="border rounded px-2 py-1 text-sm"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                void loadRecentEvents();
                void loadDeviceHealth();
              }}
              disabled={eventsLoading || devicesLoading}
              className="text-sm border px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {eventsLoading ? 'Refreshing…' : 'Refresh'}
            </button>
            <label className="flex items-center gap-2 text-sm ml-auto">
              <span className="text-gray-700">Live monitoring</span>
              <select
                className="border rounded px-2 py-1 text-sm"
                value={liveMonitoring ? 'on' : 'off'}
                onChange={(e) => setLiveMonitoring(e.target.value === 'on')}
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </label>
          </div>

          {liveMonitoring && (
            <p className="text-xs text-gray-500">
              Live monitoring refreshes events every {ANPR_EVENT_POLL_MS / 1000}s and device
              health every {ANPR_DEVICE_POLL_MS / 1000}s while this tab is visible. Defaults to
              Off on each visit.
            </p>
          )}

          {lifecycle === 'enabled_disconnected' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900">
              ANPR is enabled but no recent device heartbeat was received. Check the on-site
              relay or cameras.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-xs text-gray-500">Provider</div>
              <div className="font-medium">{providerLabel(config)}</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-xs text-gray-500">Cameras / devices</div>
              <div className="font-medium">{cameraCount || devices.length}</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-xs text-gray-500">Last event</div>
              <div className="font-medium">{lastEventLabel}</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-xs text-gray-500">Events shown</div>
              <div className="font-medium">{events.length}</div>
            </div>
          </div>

          {eventsError && <div className="text-xs text-red-600">{eventsError}</div>}

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[480px]">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Time</th>
                    <th className="px-3 py-2 text-left font-semibold">Device</th>
                    <th className="px-3 py-2 text-left font-semibold">Mode</th>
                    <th className="px-3 py-2 text-left font-semibold">Plate</th>
                    <th className="px-3 py-2 text-left font-semibold">Result</th>
                    <th className="px-3 py-2 text-left font-semibold">Booking</th>
                    <th className="px-3 py-2 text-left font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {events.length === 0 && !eventsLoading && (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-center text-gray-500">
                        No gate events in this range.
                      </td>
                    </tr>
                  )}
                  {events.map((ev) => {
                    const resultPositive = ev.result === 'allow' || ev.result === 'success';
                    return (
                      <tr key={ev.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]">
                          {new Date(ev.event_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{ev.device_name}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{ev.mode}</td>
                        <td className="px-3 py-2 whitespace-nowrap font-mono">
                          {ev.plate || (ev.qr_code ? `QR: ${ev.qr_code}` : '—')}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              resultPositive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {ev.result}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]">
                          {ev.booking_reference || '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{ev.reason || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {view === 'configure' && (
        <AnprSettingsPanel
          tenantId={tenantId}
          onConfigSaved={(next) => {
            setConfig(next);
            if (!next.enabled) {
              setView('overview');
            }
          }}
        />
      )}

      {view === 'snap-relay' && <SnapRelayPanel tenantId={tenantId} />}

      {enabled && view === 'devices' && <GateDevicesPanel tenantId={tenantId} />}
    </div>
  );
}
