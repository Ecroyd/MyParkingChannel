'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface IngestCanaryHealthResponse {
  ok?: boolean;
  status: 'ok' | 'down' | 'unknown';
  lastSentAt: string | null;
  lastReceivedAt: string | null;
  lastError: string | null;
  processingDown?: boolean;
  lastProcessedAt?: string | null;
}

interface IngestCanaryHealthBannerProps {
  isPlatformAdmin?: boolean;
}

export function IngestCanaryHealthBanner({ isPlatformAdmin = false }: IngestCanaryHealthBannerProps) {
  const [data, setData] = useState<IngestCanaryHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isVisible, setIsVisible] = useState(true);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/admin/ingest-canary/health');
      const json = await res.json();
      if (res.ok && json.error == null) {
        setData(json);
        if (json.status === 'down' || json.processingDown === true) setIsVisible(true);
      }
    } catch (err) {
      console.error('[INGEST CANARY BANNER] Failed to fetch', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60000); // every 60s
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) return null;
  if (!data) return null;

  // No banner when ingest OK and processing OK
  const processingDown = data.processingDown === true;
  if (data.status === 'ok' && !processingDown) return null;

  // status === 'unknown': subtle yellow for platform admins only
  if (data.status === 'unknown') {
    if (!isPlatformAdmin || !isVisible) return null;
    return (
      <div className="bg-amber-50 border-l-4 border-amber-400 rounded-lg p-4 mb-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-900">
              Ingest canary has not run yet. Set up cron to call <code className="text-xs bg-amber-100 px-1 rounded">POST /api/internal/cron/ingest-canary</code>.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setIsVisible(false)} className="text-amber-800">
            ×
          </Button>
        </div>
      </div>
    );
  }

  // status === 'down': red banner(s)
  if (!isVisible) return null;

  const lastOk = formatDate(data.lastReceivedAt) || 'never';
  const lastProcessedOk = formatDate(data.lastProcessedAt) || 'never';

  return (
    <div className="space-y-3 mb-4">
      {/* Ingest DOWN = received_at missing or too old (Cloudflare) */}
      {data.status === 'down' && (
      <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <XCircle className="h-6 w-6 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900">
                Booking email ingest appears DOWN (Cloudflare)
              </h3>
              <p className="text-sm text-red-800 mt-1">
                Forwarded booking emails may not be processed. Last OK: {lastOk}.
                {data.lastError && (
                  <span className="block mt-1 text-red-700 text-xs">{data.lastError}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchHealth} className="text-red-700 hover:text-red-900">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsVisible(false)} className="text-red-700 hover:text-red-900">
              ×
            </Button>
          </div>
        </div>
      </div>
      )}

      {/* Processing degraded = processed_at missing or too old (Parser/DB) */}
      {processingDown && (
        <div className="bg-amber-50 border-l-4 border-amber-500 rounded-lg p-4 shadow">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900">
                  Booking email processing appears DOWN (Parser/DB)
                </h3>
                <p className="text-sm text-amber-800 mt-1">
                  Emails are received but parsing/DB may be failing. Last processed OK: {lastProcessedOk}.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={fetchHealth} className="text-amber-700 hover:text-amber-900">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsVisible(false)} className="text-amber-700 hover:text-amber-900">
                ×
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
