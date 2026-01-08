'use client';

import { useState, useEffect } from 'react';
import { Search, Link2, X, Image as ImageIcon } from 'lucide-react';

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
  const [selectedEvent, setSelectedEvent] = useState<AnprEvent | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Booking[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);

  // Fetch events
  useEffect(() => {
    async function fetchEvents() {
      setLoading(true);
      try {
        const status = activeTab === 'unmatched' ? 'unmatched' : undefined;
        const url = `/api/admin/anpr/events?tenantId=${tenantId}${status ? `&status=${status}` : ''}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
        }
      } catch (error) {
        console.error('Failed to fetch events:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
    // Refresh every 10 seconds
    const interval = setInterval(fetchEvents, 10000);
    return () => clearInterval(interval);
  }, [tenantId, activeTab]);

  // Search bookings
  async function handleSearchBookings(query: string) {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/admin/bookings/search?tenantId=${tenantId}&q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.bookings || []);
      }
    } catch (error) {
      console.error('Failed to search bookings:', error);
    } finally {
      setSearching(false);
    }
  }

  // Resolve event (link to booking)
  async function handleResolve(eventId: string, bookingId: string, correctedPlate?: string) {
    setResolving(true);
    try {
      const res = await fetch(`/api/anpr/events/${eventId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, correctedPlate }),
      });

      if (res.ok) {
        // Refresh events
        const status = activeTab === 'unmatched' ? 'unmatched' : undefined;
        const url = `/api/admin/anpr/events?tenantId=${tenantId}${status ? `&status=${status}` : ''}`;
        const refreshRes = await fetch(url);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setEvents(data.events || []);
        }
        setSelectedEvent(null);
        setSearchTerm('');
        setSearchResults([]);
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to link event');
      }
    } catch (error) {
      console.error('Failed to resolve event:', error);
      alert('Failed to link event');
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">ANPR Events</h1>
        <p className="text-sm text-gray-600">
          View and resolve unmatched ANPR camera reads
        </p>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex space-x-4">
        <button
          onClick={() => setActiveTab('unmatched')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'unmatched'
              ? 'border-blue-600 text-blue-600 font-medium'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Unmatched ({events.filter(e => e.status === 'unmatched').length})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === 'all'
              ? 'border-blue-600 text-blue-600 font-medium'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          All
        </button>
      </div>

      {/* Events Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading events...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No events found</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Time</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Direction</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Plate</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Confidence</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Camera</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {new Date(event.event_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        event.direction === 'in'
                          ? 'bg-green-100 text-green-800'
                          : event.direction === 'out'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {event.direction.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">{event.plate_raw}</td>
                  <td className="px-4 py-3">
                    {event.confidence !== null ? `${Math.round(event.confidence * 100)}%` : '—'}
                  </td>
                  <td className="px-4 py-3">{event.camera_id || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        event.status === 'matched'
                          ? 'bg-blue-100 text-blue-800'
                          : event.status === 'corrected'
                          ? 'bg-purple-100 text-purple-800'
                          : event.status === 'ignored'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {event.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {event.snapshot_url && (
                        <a
                          href={event.snapshot_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                          title="View snapshot"
                        >
                          <ImageIcon className="w-4 h-4" />
                        </a>
                      )}
                      {event.status === 'unmatched' && (
                        <button
                          onClick={() => setSelectedEvent(event)}
                          className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          <Link2 className="w-4 h-4" />
                          Link
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Link Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Link to Booking</h2>
              <button
                onClick={() => {
                  setSelectedEvent(null);
                  setSearchTerm('');
                  setSearchResults([]);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">Event Details:</p>
                <div className="bg-gray-50 p-3 rounded text-sm space-y-1">
                  <p><strong>Time:</strong> {new Date(selectedEvent.event_at).toLocaleString()}</p>
                  <p><strong>Plate:</strong> {selectedEvent.plate_raw} ({selectedEvent.plate_normalized})</p>
                  <p><strong>Direction:</strong> {selectedEvent.direction.toUpperCase()}</p>
                  {selectedEvent.snapshot_url && (
                    <div className="mt-2">
                      <img
                        src={selectedEvent.snapshot_url}
                        alt="Snapshot"
                        className="max-w-full h-auto rounded border"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Search for booking (by reference, customer name, or plate):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      handleSearchBookings(e.target.value);
                    }}
                    placeholder="Enter reference, name, or plate..."
                    className="flex-1 border rounded px-3 py-2"
                  />
                  <Search className="w-5 h-5 text-gray-400 mt-2" />
                </div>
              </div>

              {searching && (
                <div className="text-sm text-gray-500">Searching...</div>
              )}

              {searchResults.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Select a booking:</p>
                  <div className="border rounded divide-y max-h-60 overflow-y-auto">
                    {searchResults.map((booking) => (
                      <button
                        key={booking.id}
                        onClick={() => handleResolve(selectedEvent.id, booking.id)}
                        disabled={resolving}
                        className="w-full text-left p-3 hover:bg-gray-50 transition-colors disabled:opacity-50"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{booking.reference}</p>
                            <p className="text-sm text-gray-600">
                              {booking.customer_name} • {booking.plate}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(booking.start_at).toLocaleString()} - {new Date(booking.end_at).toLocaleString()}
                            </p>
                          </div>
                          <Link2 className="w-4 h-4 text-blue-600" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {searchTerm && !searching && searchResults.length === 0 && (
                <div className="text-sm text-gray-500">No bookings found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


