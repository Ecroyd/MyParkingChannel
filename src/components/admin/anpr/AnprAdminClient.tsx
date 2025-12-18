// components/admin/anpr/AnprAdminClient.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';

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

type Tab = 'events' | 'devices' | 'settings';

export default function AnprAdminClient({ tenantId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('events');

  const today = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">ANPR / Gate Control</h1>
          <p className="text-sm text-gray-600">
            Live ANPR hits and gate device configuration for this tenant.
          </p>
        </div>
        <div className="text-xs text-gray-500">
          Tenant ID:{' '}
          <span className="ml-1 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
            {tenantId}
          </span>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex space-x-4">
        <button
          onClick={() => setActiveTab('events')}
          className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'events'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-800'
          }`}
        >
          Gate Events
        </button>
        <button
          onClick={() => setActiveTab('devices')}
          className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'devices'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-800'
          }`}
        >
          Gate Devices
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'settings'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-800'
          }`}
        >
          ANPR Settings
        </button>
      </div>

      {/* Filters (events tab only) */}
      {activeTab === 'events' && (
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              From
            </label>
            <input
              type="date"
              className="border rounded px-2 py-1 text-sm"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              To
            </label>
            <input
              type="date"
              className="border rounded px-2 py-1 text-sm"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <p className="text-xs text-gray-500">
            Live view – refreshes every 5 seconds.
          </p>
        </div>
      )}

      {activeTab === 'events' ? (
        <GateEventsTable
          tenantId={tenantId}
          fromDate={fromDate}
          toDate={toDate}
        />
      ) : activeTab === 'devices' ? (
        <GateDevicesPanel tenantId={tenantId} />
      ) : (
        <AnprSettingsPanel tenantId={tenantId} />
      )}
    </div>
  );
}

/* ---------------------- GATE EVENTS: LIVE HITS ----------------------- */

function GateEventsTable({
  tenantId,
  fromDate,
  toDate,
}: {
  tenantId: string;
  fromDate: string;
  toDate: string;
}) {
  const [events, setEvents] = useState<GateEvent[]>([]);
  const [devices, setDevices] = useState<GateDevice[]>([]);
  const [config, setConfig] = useState<{ offline_after_minutes: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch events
        const params = new URLSearchParams({
          tenantId,
          from: fromDate,
          to: toDate,
          limit: '200',
        });
        const res = await fetch(`/api/admin/gate-events?${params.toString()}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load gate events');
        }
        const data = (await res.json()) as { events: GateEvent[] };
        if (!aborted) {
          setEvents(data.events || []);
        }

        // Fetch devices for offline detection
        const devicesRes = await fetch(`/api/admin/gate-devices?${new URLSearchParams({ tenantId }).toString()}`);
        if (devicesRes.ok) {
          const devicesData = (await devicesRes.json()) as { devices: GateDevice[] };
          if (!aborted) {
            setDevices(devicesData.devices || []);
          }
        }

        // Fetch ANPR config for offline threshold
        const configRes = await fetch(`/api/admin/anpr/config?${new URLSearchParams({ tenantId }).toString()}`);
        if (configRes.ok) {
          const configData = (await configRes.json()) as { config: { offline_after_minutes: number } };
          if (!aborted) {
            setConfig(configData.config || null);
          }
        }
      } catch (err: any) {
        console.error(err);
        if (!aborted) {
          setError(err.message || 'Error loading gate events');
        }
      } finally {
        if (!aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    timer = setInterval(fetchData, 5000);

    return () => {
      aborted = true;
      if (timer) clearInterval(timer);
    };
  }, [tenantId, fromDate, toDate]);

  // Check for offline devices
  const offlineThreshold = config?.offline_after_minutes || 15;
  const now = new Date();
  const offlineDevices = devices.filter(dev => {
    if (!dev.last_seen) return true;
    const lastSeen = new Date(dev.last_seen);
    const minutesSince = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
    return minutesSince > offlineThreshold;
  });

  return (
    <div className="space-y-4">
      {/* Offline banner */}
      {offlineDevices.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-yellow-800 font-semibold text-sm">⚠️ Offline Devices</span>
            <span className="text-xs text-yellow-700">
              {offlineDevices.length} device(s) haven't been seen in over {offlineThreshold} minutes:
            </span>
            <span className="text-xs text-yellow-800 font-medium">
              {offlineDevices.map(d => d.name).join(', ')}
            </span>
          </div>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
          <div className="text-xs text-gray-600">
            Showing latest {events.length} events
          </div>
          {loading && (
            <div className="text-xs text-blue-600 animate-pulse">
              Refreshing…
            </div>
          )}
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>

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
            {events.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-4 text-center text-gray-500"
                >
                  No gate events in this range.
                </td>
              </tr>
            )}
            {events.map((ev) => {
              const dt = new Date(ev.event_at);
              const timeLabel = dt.toLocaleString();

              const resultPositive =
                ev.result === 'allow' || ev.result === 'success';

              const resultBadgeClasses = resultPositive
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800';

              const modeBadgeClasses =
                ev.mode === 'entry'
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-purple-100 text-purple-800';

              return (
                <tr key={ev.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-[11px] font-mono">{timeLabel}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-[11px]">{ev.device_name}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${modeBadgeClasses}`}
                    >
                      {ev.mode}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {ev.plate ? (
                      <span className="font-mono text-xs">{ev.plate}</span>
                    ) : ev.qr_code ? (
                      <span className="font-mono text-[10px]">
                        QR: {ev.qr_code}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${resultBadgeClasses}`}
                    >
                      {ev.result}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {ev.booking_reference ? (
                      <div className="flex flex-col">
                        <span className="font-mono text-[11px]">
                          {ev.booking_reference}
                        </span>
                        {ev.booking_status && (
                          <span className="text-[10px] text-gray-500">
                            {ev.booking_status}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[11px] text-gray-600">
                      {ev.reason || '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

/* --------------------- GATE DEVICES + API KEYS ---------------------- */

function GateDevicesPanel({ tenantId }: { tenantId: string }) {
  const [devices, setDevices] = useState<GateDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatedMessage, setGeneratedMessage] = useState<string | null>(null);
  const [integrationOrigin, setIntegrationOrigin] = useState<string>('');
  const [showTokenModal, setShowTokenModal] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Use NEXT_PUBLIC_APP_URL if available, otherwise use window.location.origin
      // NEXT_PUBLIC_* vars are available in client-side code in Next.js
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL as string) || window.location.origin;
      setIntegrationOrigin(baseUrl);
    }
  }, []);

  const loadDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ tenantId });
      // adjust path if your backend is different
      const res = await fetch(`/api/admin/gate-devices?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load gate devices');
      }
      const data = (await res.json()) as { devices: GateDevice[] };
      setDevices(data.devices || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error loading gate devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const handleGenerateKey = async (deviceId: string) => {
    try {
      setGeneratingFor(deviceId);
      setGeneratedKey(null);
      setGeneratedMessage(null);

      // adjust path if your backend is different
      const res = await fetch(
        `/api/admin/gate-devices/${deviceId}/generate-key`,
        {
          method: 'POST',
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate device key');
      }
      const data = await res.json();
      setGeneratedKey(data.rawKey);
      setGeneratedMessage(
        data.message ||
          'Copy this API key now. It will not be shown again after you leave this page.'
      );
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to generate key'); // swap for toast if you like
    } finally {
      setGeneratingFor(null);
    }
  };

  const webhookUrl = integrationOrigin
    ? `${integrationOrigin}/api/integrations/anpr/webhook`
    : '/api/integrations/anpr/webhook';

  return (
    <div className="space-y-4">
      {/* Intro + integration overview */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Gate Devices</h2>
          <p className="text-xs text-gray-600 max-w-xl">
            Configure ANPR cameras, QR readers, and other gate controllers. For
            Snap ANPR, generate an API key for the device and give your
            installer the endpoint + headers below so the box (or bridge) can
            POST plate reads to this tenant.
          </p>
        </div>
        <button
          onClick={loadDevices}
          disabled={loading}
          className="text-xs border px-2 py-1 rounded hover:bg-gray-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      {/* Devices table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b flex justify-between items-center">
          <span className="text-xs text-gray-600">
            {devices.length} devices
          </span>
          <span className="text-[10px] text-gray-400">
            Gate devices come from your main settings / infra. Use this page to
            wire them into ANPR.
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-left font-semibold">Kind</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Last Seen</th>
                <th className="px-3 py-2 text-left font-semibold">
                  API / Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {devices.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-gray-500"
                  >
                    No gate devices configured yet. Add a device in your main
                    gate settings, then come back here to generate an API key.
                  </td>
                </tr>
              )}
              {devices.map((dev) => {
                const lastSeenLabel = dev.last_seen
                  ? new Date(dev.last_seen).toLocaleString()
                  : 'Never';

                const statusBadgeClasses =
                  dev.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : dev.status === 'inactive'
                    ? 'bg-gray-100 text-gray-700'
                    : 'bg-yellow-100 text-yellow-800';

                const kindLabel =
                  dev.kind === 'anpr'
                    ? 'ANPR Camera'
                    : dev.kind === 'qr'
                    ? 'QR Reader'
                    : dev.kind;

                const isGenerating = generatingFor === dev.id;
                const canGenerate = dev.status === 'active';

                return (
                  <tr key={dev.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">{dev.name}</span>
                        <span className="text-[10px] text-gray-500 font-mono">
                          {dev.id}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-[11px] text-gray-700">
                        {kindLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadgeClasses}`}
                      >
                        {dev.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="text-[11px] text-gray-700">
                        {lastSeenLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleGenerateKey(dev.id)}
                          disabled={isGenerating || !canGenerate}
                          className="text-[11px] border px-2 py-0.5 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isGenerating ? 'Generating…' : 'Generate API Key'}
                        </button>
                        <span className="text-[10px] text-gray-400">
                          Give this key + endpoint to your ANPR installer.
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Integration instructions + generated key */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Connection details card */}
        <div className="border border-gray-200 rounded-lg p-3 space-y-2">
          <h3 className="text-sm font-semibold">How to connect Snap ANPR</h3>
          <p className="text-xs text-gray-600">
            Ask your installer to POST every plate read to this endpoint:
          </p>
          <div className="bg-gray-50 border rounded px-2 py-1 font-mono text-[11px] break-all">
            {webhookUrl}
          </div>
          <p className="text-xs text-gray-600">With headers:</p>
          <div className="bg-gray-50 border rounded px-2 py-1 font-mono text-[11px] break-all">
            Content-Type: application/json
            <br />
            Authorization: Bearer YOUR_GENERATED_KEY
          </div>
          <p className="text-xs text-gray-600">
            And a JSON body like this (fields can be mapped from Snap&apos;s
            output):
          </p>
          <pre className="bg-gray-50 border rounded px-2 py-2 text-[10px] font-mono overflow-x-auto">
{`{
  "plate": "AB12 CDE",
  "direction": "entry",
  "seenAt": "2025-01-01T10:15:00Z",
  "raw": {
    "source": "snap",
    "cameraId": "CAM-1"
  }
}`}
          </pre>
        </div>

        {/* Generated key card */}
        {generatedKey ? (
          <div className="border border-blue-200 bg-blue-50 rounded-lg px-3 py-3 space-y-2">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  New device API key
                </p>
                {generatedMessage && (
                  <p className="text-xs text-blue-800">{generatedMessage}</p>
                )}
              </div>
              <button
                onClick={() =>
                  navigator.clipboard.writeText(generatedKey).catch(() => {})
                }
                className="text-[11px] border border-blue-400 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-100"
              >
                Copy key
              </button>
            </div>
            <div className="bg-white border border-blue-200 rounded px-2 py-1 font-mono text-[11px] break-all">
              {generatedKey}
            </div>
            <p className="text-[10px] text-blue-800">
              Give this key to your Snap ANPR installer or bridge script
              together with the URL on the left. Once they&apos;ve configured
              it, plate reads will start appearing in the Gate Events tab.
            </p>
          </div>
        ) : (
          <div className="border border-dashed border-blue-200 rounded-lg px-3 py-3 text-xs text-blue-900 bg-blue-50/40">
            <p className="font-semibold mb-1">
              Generate a key to connect your first ANPR device
            </p>
            <p>
              Pick a device in the table above (e.g. your Snap ANPR processor),
              click <span className="font-mono">Generate API Key</span>, then
              paste that key into the Snap box or local bridge along with the
              endpoint URL. When it&apos;s working, you&apos;ll see live hits in
              the Gate Events tab.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------- ANPR SETTINGS PANEL ---------------------- */

type AnprConfig = {
  tenant_id: string;
  enabled: boolean;
  dedupe_seconds: number;
  offline_after_minutes: number;
  camera_direction_map: Record<string, string>;
  arrival_grace_minutes: number;
  departure_grace_minutes: number;
  whitelist_lookahead_days: number;
  whitelist_keep_after_end_hours: number;
  videofit_mode?: 'relay' | 'direct';
  videofit_base_url?: string | null;
  videofit_site_client_license?: number | null;
  videofit_loc_pc_no?: number | null;
  videofit_default_group?: number | null;
  csv_token_last_rotated_at?: string | null;
};

function AnprSettingsPanel({ tenantId }: { tenantId: string }) {
  const [config, setConfig] = useState<AnprConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [integrationOrigin, setIntegrationOrigin] = useState<string>('');
  const [generatingCsvToken, setGeneratingCsvToken] = useState(false);
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [testingUrl, setTestingUrl] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; rowCount?: number } | null>(null);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [testingVideofitPing, setTestingVideofitPing] = useState(false);
  const [testingVideofitVehicle, setTestingVideofitVehicle] = useState(false);
  const [videofitPingResult, setVideofitPingResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [videofitVehicleResult, setVideofitVehicleResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [relayToken, setRelayToken] = useState<string | null>(null);
  const [relayTokenLoading, setRelayTokenLoading] = useState(false);
  const [relayTokenGenerating, setRelayTokenGenerating] = useState(false);
  const [showRelayToken, setShowRelayToken] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Prefer NEXT_PUBLIC_APP_URL, fallback to window.location.origin
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL as string) || window.location.origin;
      setIntegrationOrigin(baseUrl);
    }
  }, []);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/admin/anpr/config?${new URLSearchParams({ tenantId }).toString()}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load ANPR config');
        }
        const data = (await res.json()) as { config: AnprConfig };
        setConfig(data.config);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Error loading ANPR config');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [tenantId]);

  // Fetch relay token on mount
  useEffect(() => {
    const fetchRelayToken = async () => {
      try {
        setRelayTokenLoading(true);
        const res = await fetch(`/api/admin/anpr/relay-token?${new URLSearchParams({ tenantId }).toString()}`);
        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; token: string | null };
          setRelayToken(data.token);
        }
      } catch (err) {
        console.error('Failed to fetch relay token:', err);
      } finally {
        setRelayTokenLoading(false);
      }
    };

    fetchRelayToken();
  }, [tenantId]);

  const handleSave = async () => {
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/admin/anpr/config?${new URLSearchParams({ tenantId }).toString()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save ANPR config');
      }

      const data = (await res.json()) as { config: AnprConfig };
      setConfig(data.config);
      alert('Settings saved successfully');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error saving ANPR config');
    } finally {
      setSaving(false);
    }
  };

  const handleCameraMapChange = (cameraId: string, direction: string) => {
    if (!config) return;
    const newMap = { ...config.camera_direction_map };
    if (direction) {
      newMap[cameraId] = direction;
    } else {
      delete newMap[cameraId];
    }
    setConfig({ ...config, camera_direction_map: newMap });
  };

  const webhookUrl = integrationOrigin
    ? `${integrationOrigin}/api/integrations/anpr/webhook`
    : '/api/integrations/anpr/webhook';

  if (loading) {
    return <div className="text-sm text-gray-600">Loading settings...</div>;
  }

  if (!config) {
    return <div className="text-sm text-red-600">Failed to load settings</div>;
  }

  return (
    <div className="space-y-6">
      <div className="border border-gray-200 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">ANPR Integration Settings</h2>
            <p className="text-xs text-gray-600">
              Configure ANPR vendor integration settings and webhook endpoint
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Enable toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="enabled"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            className="w-4 h-4"
          />
          <label htmlFor="enabled" className="text-sm font-medium">
            Enable ANPR Integration
          </label>
        </div>

        {/* Webhook URL */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">Webhook URL</label>
          <div className="bg-gray-50 border rounded px-3 py-2 font-mono text-xs break-all">
            {webhookUrl}
          </div>
          <p className="text-xs text-gray-600">
            Provide this URL to your ANPR vendor for webhook configuration
          </p>
        </div>

        {/* Headers */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">Required Headers</label>
          <div className="bg-gray-50 border rounded px-3 py-2 font-mono text-xs">
            Authorization: Bearer {'<device_token>'}
            <br />
            Content-Type: application/json
          </div>
        </div>

        {/* CSV Export */}
        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">Known Vehicles CSV Export</label>
          </div>
          
          {/* Authenticated download */}
          <div className="space-y-2">
            <a
              href="/api/admin/anpr/known-vehicles.csv"
              download
              className="inline-block px-3 py-1.5 bg-gray-100 border rounded text-sm hover:bg-gray-200"
            >
              Download CSV (Rolling Window)
            </a>
            <p className="text-xs text-gray-600">
              Authenticated export for manual download
            </p>
          </div>

          {/* Hosted CSV Link Section */}
          <div className="space-y-2 border-t pt-4">
            <label className="block text-sm font-medium">Hosted CSV Link</label>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  try {
                    setGeneratingCsvToken(true);
                    setTestResult(null);
                    const res = await fetch(
                      `/api/admin/anpr/generate-csv-token?${new URLSearchParams({ tenantId }).toString()}`,
                      { method: 'POST' }
                    );
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      throw new Error(data.error || 'Failed to generate CSV link');
                    }
                    const json = await res.json();
                    if (!json.ok) {
                      throw new Error(json.error || 'Failed to generate CSV link');
                    }

                    // Build full URL
                    const base = integrationOrigin || window.location.origin;
                    const fullUrl = `${base}/api/integrations/anpr/known-vehicles.csv?tenant=${tenantId}&token=${encodeURIComponent(json.token)}`;
                    setHostedUrl(fullUrl);
                    setShowUrlModal(true);

                    // Refresh config to get updated rotation timestamp
                    const configRes = await fetch(`/api/admin/anpr/config?${new URLSearchParams({ tenantId }).toString()}`);
                    if (configRes.ok) {
                      const configData = (await configRes.json()) as { config: AnprConfig };
                      setConfig(configData.config);
                    }
                  } catch (err: any) {
                    alert(err.message || 'Failed to generate link');
                  } finally {
                    setGeneratingCsvToken(false);
                  }
                }}
                disabled={generatingCsvToken}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {generatingCsvToken ? 'Generating...' : hostedUrl ? 'Regenerate link' : 'Generate hosted CSV link'}
              </button>
            </div>

            {hostedUrl && !showUrlModal && (
              <div className="border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 space-y-2">
                <p className="text-xs text-gray-600">
                  Link generated. Click the button above to regenerate or copy the link from the modal.
                </p>
                {config.csv_token_last_rotated_at && (
                  <p className="text-xs text-gray-500">
                    Link last generated: {new Date(config.csv_token_last_rotated_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {!hostedUrl && (
              <p className="text-xs text-gray-600">
                Generate a hosted CSV link for your ANPR system to pull vehicle data automatically
              </p>
            )}
          </div>
        </div>

        {/* Configuration fields */}
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">
              Deduplication Window (seconds)
            </label>
            <input
              type="number"
              min="0"
              max="3600"
              value={config.dedupe_seconds}
              onChange={(e) => setConfig({ ...config, dedupe_seconds: parseInt(e.target.value) || 60 })}
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Prevent duplicate events within this window
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Offline Threshold (minutes)
            </label>
            <input
              type="number"
              min="1"
              max="1440"
              value={config.offline_after_minutes}
              onChange={(e) => setConfig({ ...config, offline_after_minutes: parseInt(e.target.value) || 15 })}
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Device considered offline after this many minutes
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Arrival Grace Period (minutes)
            </label>
            <input
              type="number"
              min="0"
              max="1440"
              value={config.arrival_grace_minutes}
              onChange={(e) => setConfig({ ...config, arrival_grace_minutes: parseInt(e.target.value) || 240 })}
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Early arrival tolerance (default: 4 hours)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Departure Grace Period (minutes)
            </label>
            <input
              type="number"
              min="0"
              max="1440"
              value={config.departure_grace_minutes}
              onChange={(e) => setConfig({ ...config, departure_grace_minutes: parseInt(e.target.value) || 480 })}
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Late departure tolerance (default: 8 hours)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Whitelist Lookahead Days
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={config.whitelist_lookahead_days}
              onChange={(e) => setConfig({ ...config, whitelist_lookahead_days: parseInt(e.target.value) || 7 })}
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Number of days ahead to include bookings in whitelist CSV (default: 7 days)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Keep After End (hours)
            </label>
            <input
              type="number"
              min="0"
              max="168"
              value={config.whitelist_keep_after_end_hours}
              onChange={(e) => setConfig({ ...config, whitelist_keep_after_end_hours: parseInt(e.target.value) || 24 })}
              className="w-full border rounded px-2 py-1 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Hours after booking end to keep in whitelist CSV (default: 24 hours)
            </p>
          </div>
        </div>

        {/* Videofit Integration */}
        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Videofit SendDbBulkUpdate Integration</h3>
              <p className="text-xs text-gray-600">
                Push vehicle records to Videofit ANPR system
              </p>
            </div>
            <div className="flex gap-2">
              {config.videofit_mode === 'direct' && (
                <button
                  onClick={async () => {
                    try {
                      setTestingVideofitPing(true);
                      setVideofitPingResult(null);
                      const res = await fetch(
                        `/api/admin/anpr/test-videofit-ping?${new URLSearchParams({ tenantId }).toString()}`,
                        { method: 'POST' }
                      );
                      const data = await res.json();
                      if (res.ok && data.success) {
                        setVideofitPingResult({ success: true, message: data.message });
                      } else {
                        setVideofitPingResult({ success: false, message: data.error || 'Ping failed' });
                      }
                    } catch (err: any) {
                      setVideofitPingResult({ success: false, message: err.message || 'Ping failed' });
                    } finally {
                      setTestingVideofitPing(false);
                    }
                  }}
                  disabled={testingVideofitPing || !config.videofit_base_url}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingVideofitPing ? 'Testing...' : 'Test ANPR Connection'}
                </button>
              )}
              <button
                onClick={async () => {
                  try {
                    setTestingVideofitVehicle(true);
                    setVideofitVehicleResult(null);
                    const res = await fetch(
                      `/api/admin/anpr/test-videofit-vehicle?${new URLSearchParams({ tenantId }).toString()}`,
                      { method: 'POST' }
                    );
                    const data = await res.json();
                    if (res.ok && data.success) {
                      setVideofitVehicleResult({ success: true, message: data.message });
                    } else {
                      setVideofitVehicleResult({ success: false, message: data.error || 'Test failed' });
                    }
                  } catch (err: any) {
                    setVideofitVehicleResult({ success: false, message: err.message || 'Test failed' });
                  } finally {
                    setTestingVideofitVehicle(false);
                  }
                }}
                disabled={
                  testingVideofitVehicle ||
                  !config.videofit_site_client_license ||
                  (config.videofit_loc_pc_no === null || config.videofit_loc_pc_no === undefined) ||
                  (config.videofit_mode === 'relay' ? !relayToken : !config.videofit_base_url)
                }
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testingVideofitVehicle ? 'Sending...' : 'Send Test Vehicle'}
              </button>
            </div>
          </div>

          {(videofitPingResult || videofitVehicleResult) && (
            <div
              className={`border rounded px-3 py-2 text-sm ${
                (videofitPingResult?.success || videofitVehicleResult?.success)
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {videofitPingResult?.message || videofitVehicleResult?.message}
            </div>
          )}

          {/* Mode Selector */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Integration Mode
            </label>
            <select
              value={config.videofit_mode || 'relay'}
              onChange={(e) => setConfig({ ...config, videofit_mode: e.target.value as 'relay' | 'direct' })}
              className="w-full border rounded px-2 py-1 text-sm"
            >
              <option value="relay">Local Relay (Recommended)</option>
              <option value="direct">Direct Network (Advanced)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {config.videofit_mode === 'relay'
                ? 'Uses on-site relay script to poll for updates. No direct network access required.'
                : 'Direct connection from server to Videofit. Requires network access to Videofit server.'}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {config.videofit_mode === 'direct' && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Base URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  value={config.videofit_base_url || ''}
                  onChange={(e) => setConfig({ ...config, videofit_base_url: e.target.value || null })}
                  placeholder="https://192.168.1.50"
                  className="w-full border rounded px-2 py-1 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Videofit server base URL (e.g. https://192.168.1.50)
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">
                Site Client License <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={config.videofit_site_client_license || ''}
                onChange={(e) => setConfig({ ...config, videofit_site_client_license: e.target.value ? parseInt(e.target.value, 10) : null })}
                placeholder="18834562"
                className="w-full border rounded px-2 py-1 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Videofit site client license number
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Location PC No <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                value={config.videofit_loc_pc_no ?? 0}
                onChange={(e) => setConfig({ ...config, videofit_loc_pc_no: parseInt(e.target.value) || 0 })}
                className="w-full border rounded px-2 py-1 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Location PC number (default: 0)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Default Group
              </label>
              <input
                type="number"
                min="1"
                value={config.videofit_default_group ?? 4}
                onChange={(e) => setConfig({ ...config, videofit_default_group: parseInt(e.target.value) || 4 })}
                className="w-full border rounded px-2 py-1 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Default vehicle group (default: 4 = Self Park)
              </p>
            </div>
          </div>
        </div>

        {/* ANPR Relay (On-Site Agent) */}
        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">ANPR Relay (On-Site Agent)</h3>
              <p className="text-xs text-gray-600">
                Token for on-site PowerShell relay script to poll vehicle updates
              </p>
            </div>
            <button
              onClick={async () => {
                try {
                  setRelayTokenGenerating(true);
                  const res = await fetch(
                    `/api/admin/anpr/relay-token/generate?${new URLSearchParams({ tenantId }).toString()}`,
                    { method: 'POST' }
                  );
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Failed to generate token');
                  }
                  const data = (await res.json()) as { ok: boolean; token: string };
                  setRelayToken(data.token);
                  setShowRelayToken(true); // Show token after generation
                  alert('Relay token generated successfully');
                } catch (err: any) {
                  alert(err.message || 'Failed to generate token');
                } finally {
                  setRelayTokenGenerating(false);
                }
              }}
              disabled={relayTokenGenerating}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {relayTokenGenerating ? 'Generating...' : relayToken ? 'Rotate Token' : 'Generate Token'}
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Relay Token
              </label>
              {relayTokenLoading ? (
                <div className="text-sm text-gray-500">Loading...</div>
              ) : relayToken ? (
                <div className="flex items-center gap-2">
                  <input
                    type={showRelayToken ? 'text' : 'password'}
                    value={relayToken}
                    readOnly
                    className="flex-1 border rounded px-2 py-1 text-sm font-mono bg-gray-50"
                  />
                  <button
                    onClick={() => setShowRelayToken(!showRelayToken)}
                    className="px-3 py-1 text-xs border rounded hover:bg-gray-50"
                  >
                    {showRelayToken ? 'Hide' : 'Show'}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(relayToken);
                        alert('Token copied to clipboard');
                      } catch (err) {
                        alert('Failed to copy token');
                      }
                    }}
                    className="px-3 py-1 text-xs border rounded hover:bg-gray-50"
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <div className="text-sm text-gray-500">No relay token yet. Click "Generate Token" to create one.</div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Secure token for on-site PowerShell relay script authentication
              </p>
            </div>

            {relayToken && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  PowerShell Config (paste into C:\ParkingChannel\anpr-relay.json)
                </label>
                <textarea
                  readOnly
                  value={JSON.stringify(
                    {
                      parkingChannelBaseUrl: integrationOrigin || 'https://myparkingchannel.app',
                      tenantId: tenantId,
                      relayToken: relayToken,
                      siteClientLicense: config?.videofit_site_client_license || 18834562,
                      locPcNo: config?.videofit_loc_pc_no ?? 0,
                      defaultGroup: config?.videofit_default_group ?? 4,
                      pollSeconds: 60,
                    },
                    null,
                    2
                  )}
                  className="w-full border rounded px-2 py-1 text-xs font-mono bg-gray-50 h-32 resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Copy this JSON and save it to C:\ParkingChannel\anpr-relay.json on the ANPR PC
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Camera Direction Mapping */}
        <div className="space-y-2">
          <label className="block text-sm font-medium">Camera Direction Mapping</label>
          <p className="text-xs text-gray-600 mb-2">
            Map camera IDs to entry/exit direction. If not mapped, defaults to entry.
          </p>
          <div className="space-y-2">
            {Object.entries(config.camera_direction_map).map(([cameraId, direction]) => (
              <div key={cameraId} className="flex items-center gap-2">
                <input
                  type="text"
                  value={cameraId}
                  readOnly
                  className="flex-1 border rounded px-2 py-1 text-sm bg-gray-50"
                />
                <select
                  value={direction}
                  onChange={(e) => handleCameraMapChange(cameraId, e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="entry">Entry</option>
                  <option value="exit">Exit</option>
                </select>
                <button
                  onClick={() => handleCameraMapChange(cameraId, '')}
                  className="px-2 py-1 text-xs border rounded hover:bg-red-50 text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="text"
                id="new-camera-id"
                placeholder="Camera ID"
                className="flex-1 border rounded px-2 py-1 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.target as HTMLInputElement;
                    const cameraId = input.value.trim();
                    if (cameraId) {
                      handleCameraMapChange(cameraId, 'entry');
                      input.value = '';
                    }
                  }
                }}
              />
              <select
                id="new-camera-direction"
                defaultValue="entry"
                className="border rounded px-2 py-1 text-sm"
                onChange={(e) => {
                  const input = document.getElementById('new-camera-id') as HTMLInputElement;
                  const cameraId = input.value.trim();
                  if (cameraId) {
                    handleCameraMapChange(cameraId, e.target.value);
                    input.value = '';
                  }
                }}
              >
                <option value="entry">Entry</option>
                <option value="exit">Exit</option>
              </select>
              <button
                onClick={() => {
                  const input = document.getElementById('new-camera-id') as HTMLInputElement;
                  const select = document.getElementById('new-camera-direction') as HTMLSelectElement;
                  const cameraId = input.value.trim();
                  if (cameraId) {
                    handleCameraMapChange(cameraId, select.value);
                    input.value = '';
                  }
                }}
                className="px-3 py-1 text-xs border rounded hover:bg-blue-50 text-blue-600"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hosted CSV Link Modal */}
      {showUrlModal && hostedUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Hosted CSV link generated</h3>
              <button
                onClick={() => {
                  setShowUrlModal(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Copy and paste this link into the ANPR system. It updates automatically.
              </p>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Hosted CSV link</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={hostedUrl}
                    className="flex-1 border rounded px-3 py-2 font-mono text-xs bg-gray-50 break-all"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(hostedUrl).catch(() => {});
                      alert('Link copied to clipboard!');
                    }}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 whitespace-nowrap"
                  >
                    Copy link
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Paste this link into Videofit's 'Read CSV at preset times' setting.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowUrlModal(false);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-800 text-sm rounded hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
