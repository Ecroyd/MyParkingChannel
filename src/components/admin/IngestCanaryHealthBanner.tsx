'use client';

import { useState } from 'react';
import { AlertCircle, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface IngestCanaryHealthResult {
  status: 'ok' | 'down' | 'unknown';
  lastOk: string | null;
  ingestDown: boolean;
  lastError: string | null;
  token: string | null;
  processingDown: boolean;
  lastProcessedOk: string | null;
}

interface IngestCanaryHealthBannerProps {
  isPlatformAdmin?: boolean;
  canary: IngestCanaryHealthResult | null;
  isLoading: boolean;
  onRefetch: () => Promise<void>;
}

export function IngestCanaryHealthBanner({ isPlatformAdmin = false, canary, isLoading, onRefetch }: IngestCanaryHealthBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

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

  if (isLoading) return null;
  if (!canary) return null;

  const data = canary;
  const processingDown = data.processingDown === true;
  if (data.status === 'ok' && !processingDown) return null;

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
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onRefetch()} className="text-amber-800" aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsVisible(false)} className="text-amber-800">
              ×
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isVisible) return null;

  const lastOkDisplay = data.lastOk ? formatDate(data.lastOk) || 'never' : 'never';
  const lastProcessedOkDisplay = data.lastProcessedOk ? formatDate(data.lastProcessedOk) || 'never' : 'never';

  return (
    <div className="space-y-3 mb-4">
      {data.ingestDown && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <XCircle className="h-6 w-6 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900">Booking email ingest appears DOWN (Cloudflare)</h3>
                <p className="text-sm text-red-800 mt-1">
                  Last OK: {lastOkDisplay}.
                  {data.lastError && (
                    <span className="block mt-1 text-red-700 text-xs">{data.lastError}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onRefetch()} className="text-red-700 hover:text-red-900" aria-label="Refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsVisible(false)} className="text-red-700 hover:text-red-900">
                ×
              </Button>
            </div>
          </div>
        </div>
      )}

      {processingDown && (
        <div className="bg-amber-50 border-l-4 border-amber-500 rounded-lg p-4 shadow">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900">Booking email processing appears DOWN (Parser/DB)</h3>
                <p className="text-sm text-amber-800 mt-1">Last processed OK: {lastProcessedOkDisplay}.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onRefetch()} className="text-amber-700 hover:text-amber-900" aria-label="Refresh">
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
