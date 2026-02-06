'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

type Tab = 'take_key' | 'arrived_key_taken';

interface BookingRow {
  id: string;
  reference: string;
  customer_name: string;
  customer_email: string | null;
  plate: string;
  start_at: string;
  end_at: string;
  status: string;
  ops_status: string;
  created_at: string;
}

const dateRangePresets = [
  { label: 'Today', getValue: () => { const t = new Date(); const s = t.toISOString().split('T')[0]; return { from: s, to: s }; } },
  { label: 'Last 7 days', getValue: () => { const t = new Date(); const to = t.toISOString().split('T')[0]; const from = new Date(t); from.setDate(from.getDate() - 6); return { from: from.toISOString().split('T')[0], to }; } },
  { label: 'Last 30 days', getValue: () => { const t = new Date(); const to = t.toISOString().split('T')[0]; const from = new Date(t); from.setDate(from.getDate() - 29); return { from: from.toISOString().split('T')[0], to }; } },
];

const todayStr = () => new Date().toISOString().split('T')[0];

export default function KeyReportClient() {
  const [tab, setTab] = useState<Tab>('take_key');
  const [from, setFrom] = useState(() => todayStr());
  const [to, setTo] = useState(() => todayStr());
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchBookings = useCallback(async () => {
    const fromStr = from || todayStr();
    const toStr = to || todayStr();

    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/key-report?tab=${tab}&from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`
      );
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setBookings(data.bookings || []);
    } catch (err) {
      console.error(err);
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [tab, from, to]);

  useEffect(() => {
    fetchBookings();
  }, [tab, from, to, fetchBookings]);

  const exportCsv = () => {
    const headers = ['Reference', 'Customer', 'Email', 'Plate', 'Start', 'End', 'Status'];
    const rows = bookings.map((b) => [
      b.reference,
      b.customer_name ?? '',
      b.customer_email ?? '',
      b.plate,
      b.start_at,
      b.end_at,
      b.status,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `key-report-${tab}-${from}-${to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Key Report</h1>
      <p className="text-sm text-gray-600">Bookings where Take Key or Arrived & Key Taken was selected.</p>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setTab('take_key')}
            className={`px-4 py-2 text-sm font-medium ${tab === 'take_key' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Take Key
          </button>
          <button
            type="button"
            onClick={() => setTab('arrived_key_taken')}
            className={`px-4 py-2 text-sm font-medium ${tab === 'arrived_key_taken' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Arrived & Key Taken
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <label className="text-sm text-gray-600">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>

        {dateRangePresets.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            size="sm"
            onClick={() => {
              const { from: f, to: t } = preset.getValue();
              setFrom(f);
              setTo(t);
            }}
          >
            {preset.label}
          </Button>
        ))}

        <Button variant="outline" size="sm" onClick={exportCsv} disabled={bookings.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Plate</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Arrival</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Departure</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                    No bookings in this range for {tab === 'take_key' ? 'Take Key' : 'Arrived & Key Taken'}.
                  </td>
                </tr>
              ) : (
                bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-sm font-medium text-gray-900">{b.reference}</td>
                    <td className="px-3 py-2 text-sm text-gray-900">{b.customer_name ?? '-'}</td>
                    <td className="px-3 py-2 text-sm font-mono text-gray-700">{b.plate}</td>
                    <td className="px-3 py-2 text-sm font-mono text-gray-600">
                      {new Date(b.start_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-3 py-2 text-sm font-mono text-gray-600">
                      {new Date(b.end_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">{b.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
