'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface CavuSyncHealthBannerProps {
  cavu: {
    ok: boolean;
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
  isLoading: boolean;
  onRefetch: () => Promise<void>;
}

export function CavuSyncHealthBanner({ cavu, isLoading, onRefetch }: CavuSyncHealthBannerProps) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  const formatDate = (dateString: string | null) => {
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
        alert('Failed to trigger sync');
      }
    } catch (err) {
      alert('Failed to trigger sync');
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) return null;
  if (!cavu || (!cavu.latestRun && !cavu.latestSuccessfulRun)) return null;

  const latestRun = cavu.latestRun;
  const latestSuccessfulRun = cavu.latestSuccessfulRun;

  let bannerState: 'error' | 'warning' | null = null;
  let bannerMessage = '';
  let bannerDetails: string[] = [];

  if (latestRun && (!latestRun.ok || (latestRun.errors && latestRun.errors.length > 0))) {
    bannerState = 'error';
    bannerMessage = 'CAVU sync failed';
    if (latestRun.errors?.length) {
      bannerDetails.push(latestRun.errors[0]);
      if (latestRun.errors.length > 1) bannerDetails.push(`+${latestRun.errors.length - 1} more error${latestRun.errors.length - 1 !== 1 ? 's' : ''}`);
    }
  } else if (latestSuccessfulRun) {
    const lastSuccess = new Date(latestSuccessfulRun.started_at);
    const diffHours = (Date.now() - lastSuccess.getTime()) / (1000 * 60 * 60);
    if (diffHours > 2) {
      bannerState = 'warning';
      bannerMessage = 'CAVU sync delayed';
      bannerDetails.push(`Last successful sync was ${formatDate(latestSuccessfulRun.started_at)}`);
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
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`font-semibold ${textColor}`}>{bannerMessage}</h3>
              {latestRun && (
                <span className={`text-xs ${textColor} opacity-75`}>Last run: {formatDate(latestRun.started_at)}</span>
              )}
            </div>
            {bannerDetails.length > 0 && (
              <div className="space-y-1">
                {bannerDetails.map((detail, idx) => (
                  <p key={idx} className={`text-sm ${textColor} opacity-90`}>{detail}</p>
                ))}
              </div>
            )}
            {latestRun?.errors?.length ? (
              <Link href="/admin/channels/cavu/sync-runs" className="text-sm font-medium underline mt-2 inline-block">
                View details
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onRefetch()} className={`${textColor} hover:opacity-80`} aria-label="Refresh">
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
