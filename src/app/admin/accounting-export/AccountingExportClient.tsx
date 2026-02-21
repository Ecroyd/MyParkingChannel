'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const dateRangePresets = [
  { label: 'This month', getValue: () => {
    const t = new Date();
    const to = t.toISOString().split('T')[0];
    const from = new Date(t.getFullYear(), t.getMonth(), 1).toISOString().split('T')[0];
    return { from, to };
  }},
  { label: 'Last 7 days', getValue: () => {
    const t = new Date();
    const to = t.toISOString().split('T')[0];
    const from = new Date(t);
    from.setDate(from.getDate() - 6);
    return { from: from.toISOString().split('T')[0], to };
  }},
  { label: 'Last 30 days', getValue: () => {
    const t = new Date();
    const to = t.toISOString().split('T')[0];
    const from = new Date(t);
    from.setDate(from.getDate() - 29);
    return { from: from.toISOString().split('T')[0], to };
  }},
];

function getDefaultRange() {
  const t = new Date();
  const to = t.toISOString().split('T')[0];
  const from = new Date(t.getFullYear(), t.getMonth(), 1).toISOString().split('T')[0];
  return { from, to };
}

export default function AccountingExportClient() {
  const defaultRange = getDefaultRange();
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [agents, setAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    const fromStr = from || defaultRange.from;
    const toStr = to || defaultRange.to;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/accounting-export?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}&list=1`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? `Request failed (${res.status})`);
        setAgents([]);
        return;
      }
      setAgents(data.agents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const fromStr = from || defaultRange.from;
  const toStr = to || defaultRange.to;
  const downloadAllUrl = `${baseUrl}/api/admin/accounting-export?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}`;

  const handleDownload = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Accounting export</h1>
        <p className="text-sm text-gray-600 mt-1">
          CSV export for reconciliation. Agent = source / external_source. One file for all bookings or per agent.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Date range</CardTitle>
          <CardDescription>Bookings by start_at in this range. Agents are derived from data in this range.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
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
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              onClick={() => handleDownload(downloadAllUrl)}
              disabled={loading}
            >
              <Download className="h-4 w-4 mr-2" />
              Download CSV (All)
            </Button>
            {agents.length > 0 && (
              <span className="text-sm text-gray-500">Per agent:</span>
            )}
            {agents.map((agentKey) => (
              <Button
                key={agentKey}
                variant="outline"
                size="sm"
                onClick={() =>
                  handleDownload(
                    `${baseUrl}/api/admin/accounting-export?from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}&agent=${encodeURIComponent(agentKey)}`
                  )
                }
                disabled={loading}
              >
                <Download className="h-4 w-4 mr-1" />
                {agentKey}
              </Button>
            ))}
          </div>
          {!loading && agents.length === 0 && !error && from && to && (
            <p className="text-sm text-gray-500">No agents in this date range. Adjust dates or download All.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
