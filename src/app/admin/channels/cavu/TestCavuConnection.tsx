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
      processed: number;
      failed: number;
      events: number;
      syncMethod?: string;
      failedReferences?: string[];
    }
  | {
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
        body: JSON.stringify({ hours: 24 }),
      });

      const data = (await res.json()) as SyncResult;
      setSyncResult(data);

      if ('ok' in data && data.ok) {
        const method = data.syncMethod === 'arrivals' ? 'arrivals' : 'events';
        if (data.failed > 0) {
          toast.success(
            `Synced ${data.processed} bookings successfully, ${data.failed} failed (${data.events} total ${method})`,
            { duration: 5000 }
          );
        } else {
          toast.success(
            `Successfully synced ${data.processed} booking${data.processed !== 1 ? 's' : ''} from ${data.events} ${method}${data.events !== 1 ? '' : ''}`
          );
        }
      } else {
        toast.error(`Sync failed: ${'error' in data ? data.error : 'Unknown error'}`);
      }
    } catch (err: any) {
      const errorResult: SyncResult = {
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
              Import bookings from CAVU for the last 24 hours.
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

        {syncResult && 'ok' in syncResult && syncResult.ok && (
          <div className={`mt-3 rounded-md p-3 text-xs ${
            syncResult.failed > 0 
              ? 'bg-amber-50 text-amber-900' 
              : 'bg-emerald-50 text-emerald-900'
          }`}>
            <p className="font-medium">
              {syncResult.failed > 0 ? 'Sync completed with errors' : 'Sync completed'}
              {syncResult.syncMethod && (
                <span className="ml-2 text-xs opacity-75">
                  (via {syncResult.syncMethod} method)
                </span>
              )}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-green-700">{syncResult.processed}</span> bookings synced successfully
              {syncResult.failed > 0 && (
                <>
                  , <span className="font-semibold text-red-700">{syncResult.failed}</span> failed
                </>
              )}
              {' '}from <span className="font-semibold">{syncResult.events}</span> {syncResult.syncMethod || 'event'}{syncResult.events !== 1 ? 's' : ''}
            </p>
            {syncResult.failed > 0 && syncResult.failedReferences && syncResult.failedReferences.length > 0 && (
              <p className="mt-2 text-xs opacity-75">
                Failed references: {syncResult.failedReferences.join(', ')}
                {syncResult.failed > syncResult.failedReferences.length && ` (+${syncResult.failed - syncResult.failedReferences.length} more)`}
              </p>
            )}
          </div>
        )}

        {syncResult && 'error' in syncResult && (
          <div className="mt-3 rounded-md bg-red-50 p-3 text-xs text-red-900">
            <p className="font-medium">Sync failed</p>
            <p className="mt-1">{syncResult.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

