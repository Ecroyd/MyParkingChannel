"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, Play, AlertCircle } from "lucide-react";

type FailedEmail = {
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

export default function EmailIngestClient() {
  const [emails, setEmails] = useState<FailedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorFilter, setErrorFilter] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchFailed = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ days: "14" });
      if (errorFilter.trim()) {
        params.set("errorContains", errorFilter.trim());
      }
      const res = await fetch(`/api/admin/ingest-emails/failed?${params}`);
      const data = await res.json();
      if (data.ok) {
        setEmails(data.emails ?? []);
      } else {
        setMessage(data.error ?? "Failed to load");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [errorFilter]);

  useEffect(() => {
    fetchFailed();
  }, [fetchFailed]);

  const reprocessOne = async (emailId: string) => {
    setProcessingId(emailId);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ingest-emails/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(`Reprocessed ${emailId} successfully`);
        await fetchFailed();
      } else {
        setMessage(data.error ?? "Reprocess failed");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Reprocess failed");
    } finally {
      setProcessingId(null);
    }
  };

  const retryAllFailed = async () => {
    setBatchRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ingest-emails/reprocess-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days: 14,
          errorContains: errorFilter.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage(
          `Retry all: ${data.succeeded}/${data.attempted} succeeded, ${data.failed} failed`
        );
        await fetchFailed();
      } else {
        setMessage(data.error ?? "Batch reprocess failed");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Batch reprocess failed");
    } finally {
      setBatchRunning(false);
    }
  };

  const openDetail = async (emailId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/admin/ingest-emails/${emailId}`);
      const data = await res.json();
      if (data.ok) {
        setDetail(data.email);
      }
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Filter error contains</label>
          <input
            className="border rounded px-2 py-1 text-sm w-64"
            value={errorFilter}
            onChange={(e) => setErrorFilter(e.target.value)}
            placeholder="e.g. external_status"
          />
        </div>
        <Button variant="outline" size="sm" onClick={fetchFailed} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button size="sm" onClick={retryAllFailed} disabled={batchRunning || emails.length === 0}>
          <Play className="h-4 w-4 mr-1" />
          Retry all failed (14d)
        </Button>
      </div>

      {message && (
        <div className="text-sm p-3 rounded bg-gray-100 border">{message}</div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            Failed emails ({emails.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-sm text-gray-500">Loading…</p>
          ) : emails.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No failed emails in the last 14 days.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-2">Received</th>
                    <th className="text-left p-2">From</th>
                    <th className="text-left p-2">To</th>
                    <th className="text-left p-2">Subject</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Error</th>
                    <th className="text-left p-2">Parse</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 whitespace-nowrap">
                        {new Date(row.received_at).toLocaleString()}
                      </td>
                      <td className="p-2 max-w-[140px] truncate" title={row.from_address ?? ""}>
                        {row.from_address ?? "—"}
                      </td>
                      <td className="p-2 max-w-[140px] truncate" title={row.to_address ?? ""}>
                        {row.to_address ?? "—"}
                      </td>
                      <td className="p-2 max-w-[200px] truncate" title={row.subject ?? ""}>
                        {row.subject ?? "—"}
                      </td>
                      <td className="p-2">{row.status}</td>
                      <td className="p-2 max-w-[220px] truncate text-red-700" title={row.error ?? ""}>
                        {row.error ?? "—"}
                      </td>
                      <td className="p-2">
                        <span className="block">{row.latest_parse_status ?? "—"}</span>
                        {row.latest_parse_error && (
                          <span className="text-xs text-red-600 truncate block max-w-[160px]" title={row.latest_parse_error}>
                            {row.latest_parse_error}
                          </span>
                        )}
                      </td>
                      <td className="p-2 space-x-1 whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openDetail(row.id)}
                        >
                          Details
                        </Button>
                        <Button
                          size="sm"
                          disabled={processingId === row.id}
                          onClick={() => reprocessOne(row.id)}
                        >
                          {processingId === row.id ? "…" : "Reprocess"}
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
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email ingest detail</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : detail ? (
            <div className="space-y-3 text-sm">
              <p>
                <strong>Subject:</strong> {detail.subject ?? "—"}
              </p>
              <p>
                <strong>From / To:</strong> {detail.from_address} → {detail.to_address}
              </p>
              <p>
                <strong>Status:</strong> {detail.status}
                {detail.error && (
                  <span className="block text-red-700 mt-1">{detail.error}</span>
                )}
              </p>
              <p>
                <strong>Raw RFC822:</strong>{" "}
                {detail.raw_present ? "stored (reprocess uses DB copy)" : "missing"}
              </p>
              {(detail.ingest_email_parses ?? []).map((p, i) => (
                <div key={i} className="border rounded p-2 bg-gray-50">
                  <p>
                    <strong>Parse status:</strong> {p.parse_status}
                  </p>
                  {p.parse_error && (
                    <p className="text-red-700">
                      <strong>Parse error:</strong> {p.parse_error}
                    </p>
                  )}
                  <p>
                    <strong>Ref guess:</strong> {p.booking_reference_guess ?? "—"}
                  </p>
                  <p>
                    <strong>Plate guess:</strong> {p.booking_plate_guess ?? "—"}
                  </p>
                  {p.forwarded_text && (
                    <pre className="mt-2 text-xs whitespace-pre-wrap max-h-40 overflow-auto">
                      {p.forwarded_text.slice(0, 2000)}
                      {p.forwarded_text.length > 2000 ? "…" : ""}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No detail</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
