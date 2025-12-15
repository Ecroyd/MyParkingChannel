'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';

type Props = {
  tenantId: string;
};

type TestResult =
  | {
      ok: true;
      operatorId: number | string;
      operatorName: string;
      date: string;
      arrivalsCount: number | null;
    }
  | {
      ok: false;
      error: string;
    };

type SyncResult =
  | {
      ok: true;
      tenantId: string;
      hours: number;
      eventsSeen: number;
      bookingsUpserted: number;
      bookingsCancelled: number;
      errors: string[];
    }
  | {
      ok: false;
      error: string;
    };

export function TestCavuConnection({ tenantId }: Props) {
  const [testLoading, setTestLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  async function handleTest() {
    setTestLoading(true);
    setTestResult(null);

    try {
      const res = await fetch(
        `/api/internal/suppliers/cavu/test?tenantId=${encodeURIComponent(
          tenantId
        )}`,
        {
          method: 'GET',
        }
      );

      const data = (await res.json()) as TestResult;
      setTestResult(data);
      
      if (data.ok) {
        toast.success('Connection test successful!');
      } else {
        toast.error(`Connection test failed: ${data.error}`);
      }
    } catch (err: any) {
      const errorResult: TestResult = {
        ok: false,
        error: err.message ?? 'Network error while testing connection',
      };
      setTestResult(errorResult);
      toast.error(`Connection test failed: ${errorResult.error}`);
    } finally {
      setTestLoading(false);
    }
  }

  async function handleSync() {
    setSyncLoading(true);
    setSyncResult(null);

    try {
      const res = await fetch('/api/admin/cavu/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId,
          hours: 2, // Last 2 hours of events
        }),
      });

      const data = (await res.json()) as SyncResult;
      setSyncResult(data);

      if (data.ok) {
        const errorCount = data.errors.length;
        const cancelledText = data.bookingsCancelled > 0 ? `, ${data.bookingsCancelled} cancelled` : '';
        if (errorCount > 0) {
          toast.success(
            `Sync completed: ${data.eventsSeen} events processed, ${data.bookingsUpserted} bookings upserted${cancelledText}, ${errorCount} error${errorCount !== 1 ? 's' : ''}`,
            { duration: 6000 }
          );
        } else {
          toast.success(
            `Sync completed: ${data.eventsSeen} events processed, ${data.bookingsUpserted} bookings upserted${cancelledText}`
          );
        }
      } else {
        toast.error(`Sync failed: ${data.error}`);
      }
    } catch (err: any) {
      const errorResult: SyncResult = {
        ok: false,
        error: err.message ?? 'Network error while syncing',
      };
      setSyncResult(errorResult);
      toast.error(`Sync failed: ${errorResult.error}`);
    } finally {
      setSyncLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border p-4 space-y-4 bg-white">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">Test connection</h2>
          <p className="text-xs text-muted-foreground">
            Check that the operator ID and both API keys are valid and see how
            many arrivals CAVU reports for today.
          </p>
        </div>
        <button
          type="button"
          onClick={handleTest}
          disabled={testLoading}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {testLoading ? 'Testing…' : 'Run test'}
        </button>
      </div>

      {testResult && testResult.ok && (
        <div className="rounded-md bg-emerald-50 p-3 text-xs text-emerald-900">
          <p className="font-medium">
            Connected as {testResult.operatorName} ({testResult.operatorId})
          </p>
          <p className="mt-1">
            Arrivals for <span className="font-mono">{testResult.date}</span>:{' '}
            <span className="font-semibold">
              {testResult.arrivalsCount === null || testResult.arrivalsCount === undefined
                ? 'unknown (arrivals endpoint not supported)'
                : testResult.arrivalsCount}
            </span>
          </p>
        </div>
      )}

      {testResult && !testResult.ok && (
        <div className="rounded-md bg-red-50 p-3 text-xs text-red-900">
          <p className="font-medium">Connection failed</p>
          <p className="mt-1">{testResult.error}</p>
        </div>
      )}

      <div className="border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">Sync now from CAVU</h2>
            <p className="text-xs text-muted-foreground">
              Import recent bookings from CAVU events (last 2 hours).
            </p>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncLoading}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {syncLoading ? 'Syncing…' : 'Sync now'}
          </button>
        </div>

        {syncResult && syncResult.ok && (
          <div className={`mt-3 rounded-md p-3 text-xs ${
            syncResult.errors.length > 0 
              ? 'bg-amber-50 text-amber-900' 
              : 'bg-emerald-50 text-emerald-900'
          }`}>
            <p className="font-medium">
              {syncResult.errors.length > 0 ? 'Sync completed with errors' : 'Sync completed'}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-green-700">{syncResult.bookingsUpserted}</span> bookings upserted
              {syncResult.bookingsCancelled > 0 && (
                <>
                  , <span className="font-semibold text-orange-700">{syncResult.bookingsCancelled}</span> cancelled
                </>
              )}
              {' '}from <span className="font-semibold">{syncResult.eventsSeen}</span> event{syncResult.eventsSeen !== 1 ? 's' : ''} (last {syncResult.hours} hour{syncResult.hours !== 1 ? 's' : ''})
            </p>
            {syncResult.errors.length > 0 && (
              <div className="mt-2">
                <p className="font-medium text-red-700">{syncResult.errors.length} error{syncResult.errors.length !== 1 ? 's' : ''}:</p>
                <ul className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                  {syncResult.errors.slice(0, 5).map((error, idx) => (
                    <li key={idx} className="text-xs opacity-90">• {error}</li>
                  ))}
                  {syncResult.errors.length > 5 && (
                    <li className="text-xs opacity-75">... and {syncResult.errors.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {syncResult && !syncResult.ok && (
          <div className="mt-3 rounded-md bg-red-50 p-3 text-xs text-red-900">
            <p className="font-medium">Sync failed</p>
            <p className="mt-1">{syncResult.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

