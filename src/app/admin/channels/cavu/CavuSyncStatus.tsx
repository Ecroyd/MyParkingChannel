'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SyncStatusProps {
  tenantId: string;
}

interface SyncStatusData {
  ok: boolean;
  lastRun: {
    id: string;
    started_at: string;
    finished_at: string | null;
    ok: boolean;
    events_seen: number;
    bookings_upserted: number;
    bookings_cancelled: number;
    errors: string[];
    hours: number;
    meta?: {
      trigger_source?: string;
      request_id?: string;
    };
  } | null;
  lastSyncedAt: string | null;
}

export function CavuSyncStatus({ tenantId }: SyncStatusProps) {
  const [status, setStatus] = useState<SyncStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/admin/cavu/sync-status');
      const data = await res.json();
      if (data.ok) {
        setStatus(data);
      }
    } catch (err) {
      console.error('[CAVU SYNC STATUS] Failed to fetch', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchStatus();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (started: string, finished: string | null) => {
    if (!finished) return 'In progress...';
    const start = new Date(started);
    const end = new Date(finished);
    const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading sync status...
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">No sync status available</p>
      </div>
    );
  }

  const lastRun = status.lastRun;

  return (
    <div className="bg-white rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sync Status</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {lastRun ? (
        <div className="space-y-4">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            {lastRun.ok ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-700">Last run: OK</span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-600" />
                <span className="font-medium text-red-700">Last run: Failed</span>
              </>
            )}
            {!lastRun.finished_at && (
              <>
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="text-sm text-blue-700">Running...</span>
              </>
            )}
          </div>

          {/* Run Details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Started at</p>
              <p className="font-medium">{formatDate(lastRun.started_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Finished at</p>
              <p className="font-medium">{formatDate(lastRun.finished_at)}</p>
            </div>
            {lastRun.finished_at && (
              <div>
                <p className="text-muted-foreground">Duration</p>
                <p className="font-medium">{formatDuration(lastRun.started_at, lastRun.finished_at)}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">Hours synced</p>
              <p className="font-medium">{lastRun.hours}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Events seen</p>
              <p className="font-medium">{lastRun.events_seen}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Bookings upserted</p>
              <p className="font-medium">{lastRun.bookings_upserted}</p>
            </div>
            {lastRun.bookings_cancelled > 0 && (
              <div>
                <p className="text-muted-foreground">Bookings cancelled</p>
                <p className="font-medium">{lastRun.bookings_cancelled}</p>
              </div>
            )}
            {lastRun.meta?.trigger_source && (
              <div>
                <p className="text-muted-foreground">Trigger</p>
                <p className="font-medium capitalize">{lastRun.meta.trigger_source}</p>
              </div>
            )}
          </div>

          {/* Errors */}
          {lastRun.errors && lastRun.errors.length > 0 && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <p className="font-medium text-red-900 text-sm">
                  {lastRun.errors.length} error{lastRun.errors.length !== 1 ? 's' : ''}
                </p>
              </div>
              <ul className="space-y-1 text-xs text-red-800 max-h-32 overflow-y-auto">
                {lastRun.errors.slice(0, 5).map((error, idx) => (
                  <li key={idx}>• {error}</li>
                ))}
                {lastRun.errors.length > 5 && (
                  <li className="text-red-600">... and {lastRun.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">No sync runs yet</p>
        </div>
      )}

      {/* Last Synced At */}
      <div className="pt-4 border-t">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Last synced at</p>
            <p className="font-medium">{formatDate(status.lastSyncedAt)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

