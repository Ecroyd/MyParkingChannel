'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function CavuSyncHealthBanner() {
  const router = useRouter();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/admin/cavu/sync-health');
      const data = await res.json();
      if (data.ok) {
        setStatus(data);
        // Reset visibility when status changes
        setIsVisible(true);
      }
    } catch (err) {
      console.error('[CAVU SYNC HEALTH] Failed to fetch', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-hide banner after 1 minute if sync is successful
  useEffect(() => {
    if (!status) return;

    const latestRun = status.latestRun;
    const latestSuccessfulRun = status.latestSuccessfulRun;

    // Check if status is "ok" (green pill state)
    const isOk = 
      (!latestRun || (latestRun.ok && (!latestRun.errors || latestRun.errors.length === 0))) &&
      (!latestSuccessfulRun || (() => {
        const lastSuccess = new Date(latestSuccessfulRun.started_at);
        const now = new Date();
        const diffHours = (now.getTime() - lastSuccess.getTime()) / (1000 * 60 * 60);
        return diffHours <= 2;
      })()) &&
      (!latestRun || latestRun.finished_at || (() => {
        const started = new Date(latestRun.started_at);
        const now = new Date();
        const diffMins = (now.getTime() - started.getTime()) / (1000 * 60);
        return diffMins <= 15;
      })());

    if (isOk) {
      // Set timer to hide after 1 minute
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 60000); // 1 minute

      return () => clearTimeout(timer);
    } else {
      // Show banner if there's an issue
      setIsVisible(true);
    }
  }, [status]);

  const handleRunSync = async () => {
    setSyncing(true);
    setIsVisible(true); // Show banner when manually triggering sync
    try {
      const res = await fetch('/api/internal/suppliers/cavu/cron', {
        method: 'POST',
      });
      if (res.ok) {
        // Refresh status after a short delay
        setTimeout(() => {
          fetchStatus();
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

  if (loading) {
    return null;
  }

  // Don't show banner if no status or no runs (CAVU might not be configured)
  if (!status || (!status.latestRun && !status.latestSuccessfulRun)) {
    return null;
  }

  // Don't show if hidden (successful sync after 1 minute)
  if (!isVisible) {
    return null;
  }

  const latestRun = status.latestRun;
  const latestSuccessfulRun = status.latestSuccessfulRun;

  // Determine banner state
  let bannerState: 'error' | 'warning' | 'ok' | null = null;
  let bannerMessage = '';
  let bannerDetails: string[] = [];

  // RED: Latest run failed or has errors
  if (latestRun && (!latestRun.ok || (latestRun.errors && latestRun.errors.length > 0))) {
    bannerState = 'error';
    bannerMessage = 'CAVU sync failed';
    if (latestRun.errors && latestRun.errors.length > 0) {
      bannerDetails.push(latestRun.errors[0]);
      if (latestRun.errors.length > 1) {
        bannerDetails.push(`+${latestRun.errors.length - 1} more error${latestRun.errors.length - 1 !== 1 ? 's' : ''}`);
      }
    }
  }
  // AMBER: Last successful run older than 2 hours
  else if (latestSuccessfulRun) {
    const lastSuccess = new Date(latestSuccessfulRun.started_at);
    const now = new Date();
    const diffHours = (now.getTime() - lastSuccess.getTime()) / (1000 * 60 * 60);
    if (diffHours > 2) {
      bannerState = 'warning';
      bannerMessage = 'CAVU sync delayed';
      bannerDetails.push(`Last successful sync was ${formatDate(latestSuccessfulRun.started_at)}`);
    }
  }
  // AMBER: Latest run still running and started more than 15 minutes ago
  else if (latestRun && !latestRun.finished_at) {
    const started = new Date(latestRun.started_at);
    const now = new Date();
    const diffMins = (now.getTime() - started.getTime()) / (1000 * 60);
    if (diffMins > 15) {
      bannerState = 'warning';
      bannerMessage = 'CAVU sync delayed';
      bannerDetails.push(`Sync has been running for ${Math.floor(diffMins)} minutes`);
    }
  }

  // Show banner only if there's an issue
  if (bannerState === null) {
    // Show small green pill
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-md">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <span className="text-sm font-medium text-green-800">CAVU Sync OK</span>
        {latestRun && (
          <span className="text-xs text-green-600">
            Last run: {formatDate(latestRun.started_at)}
          </span>
        )}
      </div>
    );
  }

  // Show full banner for errors/warnings
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
                <span className={`text-xs ${textColor} opacity-75`}>
                  Last run: {formatDate(latestRun.started_at)}
                </span>
              )}
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
            {latestRun && latestRun.errors && latestRun.errors.length > 0 && (
              <Link
                href="/admin/channels/cavu/sync-runs"
                className="text-sm font-medium underline mt-2 inline-block"
              >
                View details
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
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

