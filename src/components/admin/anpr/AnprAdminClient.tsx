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

type Tab = 'events' | 'devices';

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
      ) : (
        <GateDevicesPanel tenantId={tenantId} />
      )}
    </div>
  );
}

/**
 * GATE EVENTS TABLE (live ANPR hits)
 * Expects a backend endpoint like:
 *   GET /api/admin/gate-events?tenantId=...&from=yyyy-mm-dd&to=yyyy-mm-dd&limit=200
 */
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchEvents = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
          tenantId,
          from: fromDate,
          to: toDate,
          limit: '200',
        });
        // TODO: if your API path differs, change this URL:
        const res = await fetch(`/api/admin/gate-events?${params.toString()}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load gate events');
        }
        const data = (await res.json()) as { events: GateEvent[] };
        if (!aborted) {
          setEvents(data.events || []);
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

    fetchEvents();
    timer = setInterval(fetchEvents, 5000); // live-ish

    return () => {
      aborted = true;
      if (timer) clearInterval(timer);
    };
  }, [tenantId, fromDate, toDate]);

  return (
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
  );
}

/**
 * GATE DEVICES PANEL
 * Expects backend endpoints:
 *   GET  /api/admin/gate-devices?tenantId=...
 *   POST /api/admin/gate-devices/:id/generate-key
 */
function GateDevicesPanel({ tenantId }: { tenantId: string }) {
  const [devices, setDevices] = useState<GateDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generatedMessage, setGeneratedMessage] = useState<string | null>(null);

  const loadDevices = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ tenantId });
      // TODO: change this URL if your path differs
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
      // TODO: change this URL if your path differs
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
      alert(err.message || 'Failed to generate key'); // or toast
    } finally {
      setGeneratingFor(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold mb-1">Gate Devices</h2>
          <p className="text-xs text-gray-600 max-w-xl">
            Configure ANPR devices, QR readers, and other gate controllers. For
            Snap ANPR, generate an API key here and paste it into the Snap box
            or local bridge so it can send plate reads to this tenant.
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

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b flex justify-between items-center">
          <span className="text-xs text-gray-600">
            {devices.length} devices
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
                    No gate devices configured yet.
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
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleGenerateKey(dev.id)}
                          disabled={isGenerating || dev.status !== 'active'}
                          className="text-[11px] border px-2 py-0.5 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isGenerating ? 'Generating…' : 'Generate API Key'}
                        </button>
                        <span className="text-[10px] text-gray-400">
                          Use this for Snap / bridge config
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

      {/* Generated key drawer / box */}
      {generatedKey && (
        <div className="border border-blue-200 bg-blue-50 rounded-lg px-3 py-3 space-y-2">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium text-blue-900">
                New device API key
              </p>
              {generatedMessage && (
                <p className="text-xs text-blue-800">{generatedMessage}</p>
              )}
            </div>
            <button
              onClick={() => {
                navigator.clipboard
                  .writeText(generatedKey)
                  .catch(() => undefined);
              }}
              className="text-[11px] border border-blue-400 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-100"
            >
              Copy key
            </button>
          </div>
          <div className="bg-white border border-blue-200 rounded px-2 py-1 font-mono text-[11px] break-all">
            {generatedKey}
          </div>
          <p className="text-[10px] text-blue-800">
            Paste this into the Snap ANPR box or your local ANPR bridge
            configuration. This key will not be shown again if you leave this
            page.
          </p>
        </div>
      )}
    </div>
  );
}

