'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Link2, X, Image as ImageIcon } from 'lucide-react';
import {
  AnprRequestController,
  ANPR_EVENT_POLL_MS,
  assertEventPollInterval,
  canPollAnprEvents,
} from '@/lib/anpr/adminAnprLifecycle';
import type { AnprConfig } from '@/components/admin/anpr/AnprSettingsPanels';

type AnprEvent = {
  id: string;
  event_at: string;
  direction: 'in' | 'out' | 'unknown';
  plate_raw: string;
  plate_normalized: string;
  confidence: number | null;
  camera_id: string | null;
  snapshot_url: string | null;
  status: 'unmatched' | 'matched' | 'corrected' | 'ignored';
  booking_id: string | null;
  created_at: string;
};

type Booking = {
  id: string;
  reference: string;
  customer_name: string;
  customer_email: string | null;
  plate: string;
  start_at: string;
  end_at: string;
};

type Tab = 'unmatched' | 'all';

export default function AnprEventsClient({ tenantId }: { tenantId: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('unmatched');
  const [events, setEvents] = useState<AnprEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AnprConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<AnprEvent | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Booking[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [liveMonitoring, setLiveMonitoring] = useState(false);
  const controller = useRef(new AnprRequestController());

  const enabled = Boolean(config?.enabled);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setConfigLoading(true);
      try {
        const res = await fetch(`/api/admin/anpr/config?tenantId=${encodeURIComponent(tenantId)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { config: AnprConfig };
        if (!cancelled) setConfig(data.config);
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.current.disable();
    };
  }, [tenantId]);

  const fetchEvents = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const result = await controller.current.run(async (signal) => {
        const status = activeTab === 'unmatched' ? 'unmatched' : undefined;
        const url = `/api/admin/anpr/events?tenantId=${tenantId}&limit=50${
          status ? `&status=${status}` : ''
        }`;
        const res = await fetch(url, { signal, cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to fetch events');
        return (await res.json()) as { events: AnprEvent[] };
      });
      if (result.ok) setEvents(result.data.events || []);
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantId, activeTab, enabled]);

  useEffect(() => {
    if (!enabled) {
      controller.current.disable();
      setEvents([]);
      setLoading(false);
      return;
    }
    void fetchEvents();
  }, [enabled, fetchEvents]);

  useEffect(() => {
    controller.current.clearIntervals();
    if (!enabled || !liveMonitoring) return;
    assertEventPollInterval(ANPR_EVENT_POLL_MS);
    const id = setInterval(() => {
      if (
        canPollAnprEvents({
          enabled,
          liveMonitoring,
          visibilityState: document.visibilityState,
          inFlight: controller.current.inFlight,
        })
      ) {
        void fetchEvents();
      }
    }, ANPR_EVENT_POLL_MS);
    controller.current.trackInterval(id);
    return () => controller.current.clearIntervals();
  }, [enabled, liveMonitoring, fetchEvents]);

  async function handleSearchBookings(query: string) {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(
        `/api/admin/bookings/search?tenantId=${tenantId}&q=${encodeURIComponent(query)}`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.bookings || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  }

  async function handleResolve(bookingId: string) {
    if (!selectedEvent) return;
    setResolving(true);
    try {
      const res = await fetch(`/api/anpr/events/${selectedEvent.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      if (res.ok) {
        setSelectedEvent(null);
        await fetchEvents();
      }
    } catch (error) {
      console.error('Resolve failed:', error);
    } finally {
      setResolving(false);
    }
  }

  if (configLoading) {
    return <div className="p-6 text-sm text-gray-600">Loading ANPR configuration…</div>;
  }

  if (!enabled) {
    return (
      <div className="p-6 space-y-3 max-w-xl">
        <h1 className="text-2xl font-semibold">ANPR Events</h1>
        <p className="text-sm text-gray-600">
          ANPR is not enabled for this tenant. Enable and configure ANPR before reviewing
          vehicle events.
        </p>
        <a href="/admin/anpr" className="inline-block text-sm text-blue-600 hover:underline">
          Configure ANPR →
        </a>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">ANPR Events</h1>
          <p className="text-sm text-gray-600">Match unmatched plates to bookings.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span>Live monitoring</span>
            <select
              className="border rounded px-2 py-1"
              value={liveMonitoring ? 'on' : 'off'}
              onChange={(e) => setLiveMonitoring(e.target.value === 'on')}
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void fetchEvents()}
            className="text-sm border px-3 py-1.5 rounded hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="border-b flex gap-4">
        {(['unmatched', 'all'] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`pb-2 text-sm border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600'
            }`}
          >
            {tab === 'unmatched' ? 'Unmatched' : 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading events…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-500">No events found.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Plate</th>
                <th className="px-3 py-2 text-left">Direction</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td className="px-3 py-2">{new Date(ev.event_at).toLocaleString()}</td>
                  <td className="px-3 py-2 font-mono">{ev.plate_raw}</td>
                  <td className="px-3 py-2">{ev.direction}</td>
                  <td className="px-3 py-2">{ev.status}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() => setSelectedEvent(ev)}
                    >
                      Resolve
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 w-full max-w-lg space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Resolve {selectedEvent.plate_raw}</h2>
              <button type="button" onClick={() => setSelectedEvent(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
              <input
                className="w-full border rounded pl-8 pr-2 py-2 text-sm"
                placeholder="Search bookings…"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  void handleSearchBookings(e.target.value);
                }}
              />
            </div>
            {searching && <p className="text-xs text-gray-500">Searching…</p>}
            <ul className="max-h-48 overflow-y-auto divide-y text-sm">
              {searchResults.map((b) => (
                <li key={b.id} className="py-2 flex justify-between gap-2">
                  <span>
                    {b.reference} · {b.plate} · {b.customer_name}
                  </span>
                  <button
                    type="button"
                    disabled={resolving}
                    className="text-blue-600 flex items-center gap-1"
                    onClick={() => void handleResolve(b.id)}
                  >
                    <Link2 className="w-3 h-3" /> Link
                  </button>
                </li>
              ))}
            </ul>
            {selectedEvent.snapshot_url && (
              <a
                href={selectedEvent.snapshot_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 flex items-center gap-1"
              >
                <ImageIcon className="w-3 h-3" /> Open snapshot
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
