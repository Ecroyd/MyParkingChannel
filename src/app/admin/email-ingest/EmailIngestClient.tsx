'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RefreshCw, Play, AlertCircle } from 'lucide-react';

type IngestEmailRow = {
  id: string;
  received_at: string;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  status: string;
  error: string | null;
  latest_parse_status: string | null;
  latest_parse_error: string | null;
  booking_plate_guess: string | null;
  booking_reference_guess: string | null;
  file_count?: number;
  booking_file_count?: number;
  files_parsed_ok?: number;
  files_failed?: number;
  detected_sources?: string[];
};

type EmailDetail = {
  id: string;
  received_at: string;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  status: string;
  error: string | null;
  raw_present: boolean;
  ingest_email_parses?: Array<{
    parse_status: string | null;
    parse_error: string | null;
    parsed_subject: string | null;
    forwarded_text: string | null;
    booking_plate_guess: string | null;
    booking_reference_guess: string | null;
  }>;
};

type Tab = 'recent' | 'failed';

export default function EmailIngestClient() {
  const [tab, setTab] = useState<Tab>('recent');
  const [emails, setEmails] = useState<IngestEmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorFilter, setErrorFilter] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      if (tab === 'recent') {
        const res = await fetch('/api/admin/ingest-emails/recent?days=7');
        const data = await res.json();
        if (data.ok) {
          setEmails(data.emails ?? []);
        } else {
          setMessage(data.error ?? 'Failed to load');
        }
      } else {
        const params = new URLSearchParams({ days: '14' });
        if (errorFilter.trim()) {
          params.set('errorContains', errorFilter.trim());
        }
        const res = await fetch(`/api/admin/ingest-emails/failed?${params}`);
        const data = await res.json();
        if (data.ok) {
          setEmails(data.emails ?? []);
        } else {
          setMessage(data.error ?? 'Failed to load');
        }
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab, errorFilter]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/ingest-emails/${id}`);
      const data = await res.json();
      if (data.ok) setDetail(data.email);
      else setMessage(data.error ?? 'Failed to load detail');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to load detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const reprocessOne = async (id: string) => {
    setProcessingId(id);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/ingest-emails/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId: id }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(`Reprocessed ${id.slice(0, 8)}…`);
        await fetchList();
      } else {
        setMessage(data.error ?? 'Reprocess failed');
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Reprocess failed');
    } finally {
      setProcessingId(null);
    }
  };

  const reprocessAllFailed = async () => {
    setBatchRunning(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/ingest-emails/reprocess-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 14 }),
      });
      const data = await res.json();
      if (data.ok || data.attempted > 0) {
        setMessage(
          `Retry all: ${data.succeeded}/${data.attempted} succeeded, ${data.failed} failed`
        );
        await fetchList();
      } else {
        setMessage(data.error ?? 'Batch reprocess failed');
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Batch reprocess failed');
    } finally {
      setBatchRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={tab === 'recent' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('recent')}
        >
          Recent (7d)
        </Button>
        <Button
          type="button"
          variant={tab === 'failed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('failed')}
        >
          Failures only
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void fetchList()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
        {tab === 'failed' && (
          <>
            <input
              className="rounded border px-2 py-1 text-sm"
              placeholder="e.g. external_status"
              value={errorFilter}
              onChange={(e) => setErrorFilter(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={batchRunning}
              onClick={() => void reprocessAllFailed()}
            >
              Retry all failed (14d)
            </Button>
          </>
        )}
      </div>

      {message && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {tab === 'recent' ? 'Recent inbound to bookings@' : 'Failed ingest emails'}
            {tab === 'failed' && <AlertCircle className="h-4 w-4 text-red-600" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-sm text-gray-500">Loading…</p>
          ) : emails.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">
              {tab === 'recent'
                ? 'No emails received at bookings@ in the last 7 days.'
                : 'No failed emails in the last 14 days.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-600">
                    <th className="p-2">Received</th>
                    <th className="p-2">Subject</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Files</th>
                    <th className="p-2">Guess</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {emails.map((row) => (
                    <tr key={row.id} className="border-b align-top">
                      <td className="p-2 whitespace-nowrap">
                        {new Date(row.received_at).toLocaleString()}
                      </td>
                      <td className="p-2">
                        <div className="font-medium">{row.subject || '—'}</div>
                        <div className="text-xs text-gray-500">{row.from_address}</div>
                        {row.error && (
                          <div className="mt-1 text-xs text-red-700 line-clamp-2">{row.error}</div>
                        )}
                      </td>
                      <td className="p-2">
                        <span
                          className={
                            row.status === 'parsed'
                              ? 'text-emerald-700'
                              : row.status === 'failed'
                                ? 'text-red-700'
                                : 'text-amber-800'
                          }
                        >
                          {row.status}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {row.latest_parse_status ?? '—'}
                        </span>
                        {row.detected_sources && row.detected_sources.length > 0 && (
                          <span className="block text-xs text-gray-600">
                            {row.detected_sources.join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-xs text-gray-700">
                        {typeof row.booking_file_count === 'number' ? (
                          <>
                            {row.files_parsed_ok ?? 0} ok / {row.files_failed ?? 0} fail
                            <span className="block text-gray-500">
                              {row.booking_file_count} booking file
                              {row.booking_file_count === 1 ? '' : 's'}
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-2 text-xs">
                        {row.booking_reference_guess || '—'}
                        <span className="block text-gray-500">
                          {row.booking_plate_guess || ''}
                        </span>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void openDetail(row.id)}
                        >
                          View
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={processingId === row.id}
                          onClick={() => void reprocessOne(row.id)}
                        >
                          <Play className="mr-1 h-3 w-3" />
                          Reprocess
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ingest email</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : detail ? (
            <div className="space-y-2 text-sm">
              <p>
                <strong>Status:</strong> {detail.status}
              </p>
              <p>
                <strong>Subject:</strong> {detail.subject}
              </p>
              <p>
                <strong>From:</strong> {detail.from_address}
              </p>
              <p>
                <strong>To:</strong> {detail.to_address}
              </p>
              <p>
                <strong>Error:</strong> {detail.error || '—'}
              </p>
              <p>
                <strong>Raw stored:</strong> {detail.raw_present ? 'yes' : 'no'}
              </p>
              {(detail.ingest_email_parses ?? []).map((p, i) => (
                <div key={i} className="rounded border p-2">
                  <p>
                    <strong>Parse status:</strong> {p.parse_status}
                  </p>
                  <p>
                    <strong>Parse error:</strong> {p.parse_error || '—'}
                  </p>
                  <p>
                    <strong>Plate / ref guess:</strong>{' '}
                    {p.booking_plate_guess || '—'} / {p.booking_reference_guess || '—'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Not found</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
