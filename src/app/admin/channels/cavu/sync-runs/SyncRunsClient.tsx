'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface SyncRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  events_seen: number | null;
  bookings_upserted: number | null;
  bookings_cancelled: number | null;
  errors: string[] | null;
  hours: number | null;
  meta?: {
    trigger_source?: string;
    request_id?: string;
  };
}

interface SyncRunsClientProps {
  runs: SyncRun[];
}

export default function SyncRunsClient({ runs }: SyncRunsClientProps) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDuration = (started: string, finished: string | null) => {
    if (!finished) return 'In progress...';
    const start = new Date(started);
    const end = new Date(finished);
    const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">CAVU Sync Runs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View history of CAVU sync operations
          </p>
        </div>
        <Link
          href="/admin/channels/cavu"
          className="text-sm text-blue-600 hover:text-blue-700 underline"
        >
          ← Back to CAVU Settings
        </Link>
      </div>

      {runs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>No sync runs found</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Sync History ({runs.length} runs)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {runs.map((run) => {
                const isRunning = !run.finished_at;
                const isSuccess = run.ok === true;
                const hasErrors = run.errors && run.errors.length > 0;

                return (
                  <div
                    key={run.id}
                    className={`border rounded-lg p-4 ${
                      isRunning
                        ? 'bg-blue-50 border-blue-200'
                        : isSuccess && !hasErrors
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          {isRunning ? (
                            <>
                              <Clock className="h-4 w-4 text-blue-600" />
                              <span className="font-medium text-blue-900">Running</span>
                            </>
                          ) : isSuccess && !hasErrors ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              <span className="font-medium text-green-900">Success</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 text-red-600" />
                              <span className="font-medium text-red-900">Failed</span>
                            </>
                          )}
                          {run.meta?.trigger_source && (
                            <Badge variant="outline" className="text-xs">
                              {run.meta.trigger_source}
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Started</p>
                            <p className="font-medium">{formatDate(run.started_at)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Finished</p>
                            <p className="font-medium">{formatDate(run.finished_at)}</p>
                          </div>
                          {run.finished_at && (
                            <div>
                              <p className="text-muted-foreground">Duration</p>
                              <p className="font-medium">{formatDuration(run.started_at, run.finished_at)}</p>
                            </div>
                          )}
                          {run.hours !== null && (
                            <div>
                              <p className="text-muted-foreground">Hours synced</p>
                              <p className="font-medium">{run.hours}</p>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm pt-2 border-t">
                          <div>
                            <p className="text-muted-foreground">Events seen</p>
                            <p className="font-medium">{run.events_seen ?? 0}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Bookings upserted</p>
                            <p className="font-medium">{run.bookings_upserted ?? 0}</p>
                          </div>
                          {run.bookings_cancelled !== null && run.bookings_cancelled > 0 && (
                            <div>
                              <p className="text-muted-foreground">Bookings cancelled</p>
                              <p className="font-medium">{run.bookings_cancelled}</p>
                            </div>
                          )}
                        </div>

                        {hasErrors && (
                          <div className="mt-3 rounded-md bg-red-100 border border-red-200 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <AlertCircle className="h-4 w-4 text-red-600" />
                              <p className="font-medium text-red-900 text-sm">
                                {run.errors!.length} error{run.errors!.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <ul className="space-y-1 text-xs text-red-800 max-h-32 overflow-y-auto">
                              {run.errors!.slice(0, 10).map((error, idx) => (
                                <li key={idx}>• {error}</li>
                              ))}
                              {run.errors!.length > 10 && (
                                <li className="text-red-600">
                                  ... and {run.errors!.length - 10} more
                                </li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

