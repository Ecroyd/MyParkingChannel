"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Play, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ImportRun = {
  id: string;
  created_at: string;
  profile_name: string | null;
  inserted_count: number | null;
  skipped_duplicates: number | null;
  error_count: number | null;
  meta?: { cancelled_count?: number } | null;
};

type StagedRow = {
  id: string;
  reference: string | null;
  status: string | null;
  source: string | null;
  external_status: string | null;
  source_filename: string | null;
  start_at: string | null;
  end_at: string | null;
  vehicle_reg: string | null;
  raw_json: unknown;
};

export default function ImportRunsClient({ tenantId }: { tenantId: string }) {
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [stagedByRunId, setStagedByRunId] = useState<Record<string, StagedRow[]>>({});
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/import-runs?limit=20");
      const data = await res.json();
      if (data.runs) setRuns(data.runs);
    } catch (e) {
      console.error("Failed to fetch import runs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [tenantId]);

  const handleApplyRun = async (runId: string) => {
    setApplying((prev) => new Set(prev).add(runId));
    try {
      const res = await fetch("/api/admin/import-runs/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Apply failed");
      await fetchRuns();
    } catch (e) {
      console.error("Apply run failed:", e);
      alert(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplying((prev) => {
        const next = new Set(prev);
        next.delete(runId);
        return next;
      });
    }
  };

  const fetchStaged = async (runId: string) => {
    if (stagedByRunId[runId]) {
      setExpandedRunId((id) => (id === runId ? null : runId));
      return;
    }
    try {
      const res = await fetch(`/api/admin/import-runs/${runId}/staged`);
      const data = await res.json();
      if (data.rows) {
        setStagedByRunId((prev) => ({ ...prev, [runId]: data.rows }));
        setExpandedRunId(runId);
      }
    } catch (e) {
      console.error("Failed to fetch staged:", e);
    }
  };

  const cancelledCount = (run: ImportRun) =>
    run.meta && typeof run.meta.cancelled_count === "number" ? run.meta.cancelled_count : null;

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Import runs</CardTitle>
            <CardDescription>
              Last 20 import runs. Apply Run re-runs upsert + cancellations for that run.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchRuns} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="text-muted-foreground">No import runs found.</p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="border rounded-lg p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-muted-foreground">
                      {new Date(run.created_at).toLocaleString()}
                    </span>
                    <span className="text-sm font-medium truncate max-w-xs" title={run.profile_name ?? undefined}>
                      {run.profile_name ?? "—"}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      inserted: {run.inserted_count ?? 0}
                      {cancelledCount(run) != null && ` · cancelled: ${cancelledCount(run)}`}
                      {run.error_count != null && run.error_count > 0 && ` · errors: ${run.error_count}`}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleApplyRun(run.id)}
                      disabled={applying.has(run.id)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      {applying.has(run.id) ? "Applying…" : "Apply Run"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fetchStaged(run.id)}
                    >
                      {expandedRunId === run.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      View staged
                    </Button>
                  </div>
                  {expandedRunId === run.id && stagedByRunId[run.id] && (
                    <div className="overflow-x-auto border-t pt-2 mt-2">
                      <table className="text-sm w-full">
                        <thead>
                          <tr className="text-left text-muted-foreground">
                            <th className="p-1">Reference</th>
                            <th className="p-1">Status</th>
                            <th className="p-1">Source</th>
                            <th className="p-1">External status</th>
                            <th className="p-1">File</th>
                            <th className="p-1">Vehicle</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stagedByRunId[run.id].map((row) => (
                            <tr key={row.id} className="border-t">
                              <td className="p-1 font-mono">{row.reference ?? "—"}</td>
                              <td className="p-1">{row.status ?? "—"}</td>
                              <td className="p-1">{row.source ?? "—"}</td>
                              <td className="p-1">{row.external_status ?? "—"}</td>
                              <td className="p-1 truncate max-w-[120px]" title={row.source_filename ?? undefined}>
                                {row.source_filename ?? "—"}
                              </td>
                              <td className="p-1">{row.vehicle_reg ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
