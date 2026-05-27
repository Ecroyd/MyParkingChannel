'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export type CavuHealthForBanner = {
  ok: boolean;
  syncStatus?: 'running' | 'success' | 'failed' | 'idle';
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  latestRun: {
    id: string;
    started_at: string;
    finished_at: string | null;
    ok: boolean;
    events_seen: number;
    bookings_upserted: number;
    bookings_cancelled: number;
    errors: string[];
    hours: number;
  } | null;
  latestSuccessfulRun: {
    id: string;
    started_at: string;
    finished_at: string | null;
  } | null;
} | null;

interface CavuSyncHealthBannerProps {
  cavu: CavuHealthForBanner;
  isLoading: boolean;
  onRefetch: () => Promise<void>;
}

export function CavuSyncHealthBanner({ cavu, isLoading, onRefetch }: CavuSyncHealthBannerProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleRunSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/internal/suppliers/cavu/cron', { method: 'POST' });
      if (res.ok) {
        setTimeout(() => {
          onRefetch();
          router.refresh();
        }, 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error ?? 'Failed to trigger sync');
      }
    } catch {
      alert('Failed to trigger sync');
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) return null;
  if (!cavu || (!cavu.latestRun && !cavu.latestSuccessfulRun && !cavu.lastRunAt)) return null;

  const latestRun = cavu.latestRun;
  const latestSuccessfulRun = cavu.latestSuccessfulRun;
  const syncStatus = cavu.syncStatus;
  const lastRunAt = cavu.lastRunAt ?? latestRun?.started_at ?? null;
  const lastSuccessAt =
    cavu.lastSuccessAt ?? latestSuccessfulRun?.started_at ?? null;
  const lastError =
    cavu.lastError ?? (latestRun && !latestRun.ok ? latestRun.errors?.[0] : null) ?? null;

  let bannerState: 'error' | 'warning' | null = null;
  let bannerMessage = '';
  const bannerDetails: string[] = [];

  if (syncStatus === 'running') {
    bannerState = 'warning';
    bannerMessage = 'CAVU sync in progress';
    if (lastRunAt) bannerDetails.push(`Started: ${formatDate(lastRunAt)}`);
  } else if (syncStatus === 'failed' || (latestRun && (!latestRun.ok || (latestRun.errors?.length ?? 0) > 0))) {
    bannerState = 'error';
    bannerMessage = 'CAVU sync failed';
    if (lastRunAt) bannerDetails.push(`Last run: ${formatDate(lastRunAt)}`);
    if (lastSuccessAt) {
      bannerDetails.push(`Last success: ${formatDate(lastSuccessAt)}`);
    }
    if (lastError) {
      bannerDetails.push(`Error: ${lastError}`);
    } else if (latestRun?.errors?.length) {
      bannerDetails.push(`Error: ${latestRun.errors[0]}`);
    }
  } else if (lastSuccessAt) {
    const lastSuccess = new Date(lastSuccessAt);
    const diffHours = (Date.now() - lastSuccess.getTime()) / (1000 * 60 * 60);
    if (diffHours > 2) {
      bannerState = 'warning';
      bannerMessage = 'CAVU sync delayed';
      if (lastRunAt) bannerDetails.push(`Last run: ${formatDate(lastRunAt)}`);
      bannerDetails.push(`Last success: ${formatDate(lastSuccessAt)}`);
      if (lastError) bannerDetails.push(`Error: ${lastError}`);
    }
  } else if (latestRun && !latestRun.finished_at) {
    const diffMins = (Date.now() - new Date(latestRun.started_at).getTime()) / (1000 * 60);
    if (diffMins > 15) {
      bannerState = 'warning';
      bannerMessage = 'CAVU sync delayed';
      bannerDetails.push(`Sync has been running for ${Math.floor(diffMins)} minutes`);
    }
  }

  if (bannerState === null) return null;

  const bgColor = bannerState === 'error' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200';
  const textColor = bannerState === 'error' ? 'text-red-900' : 'text-amber-900';
  const iconColor = bannerState === 'error' ? 'text-red-600' : 'text-amber-600';
  const Icon = bannerState === 'error' ? XCircle : AlertCircle;

  return (
    <div className={`${bgColor} border rounded-lg p-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <Icon className={`h-5 w-5 ${iconColor} mt-0.5`} />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className={`font-semibold ${textColor}`}>{bannerMessage}</h3>
            </div>
            {bannerDetails.length > 0 && (
              <div className="space-y-1">
                {bannerDetails.map((detail, idx) => (
                  <p key={idx} className={`text-sm ${textColor} opacity-90`}>
                    {detail}
                  </p>
                ))}
              </div>
            )}
            <Link
              href="/admin/channels/cavu/sync-runs"
              className="text-sm font-medium underline mt-2 inline-block"
            >
              View sync runs
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRefetch()}
            className={`${textColor} hover:opacity-80`}
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunSync}
            disabled={syncing}
            className="whitespace-nowrap"
          >
            {syncing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Run sync now
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
