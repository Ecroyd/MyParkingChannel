'use client';

import { useState } from 'react';
import { AlertCircle, XCircle, RefreshCw, FileX, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface ParseFailure {
  id: string;
  filename: string;
  parse_status: string;
  parse_error: string | null;
  parsed_at: string | null;
  created_at: string;
  ingest_emails: {
    id: string;
    from_address: string;
    subject: string;
    created_at: string;
  };
}

interface ParseHealthStatus {
  ok: boolean;
  hasIssues: boolean;
  failedFiles: ParseFailure[];
  pendingFiles: ParseFailure[];
  emptyParsedFiles: ParseFailure[];
  unparsedReceivedGroups?: Record<string, unknown[]>;
  summary: {
    failedCount: number;
    stuckPendingCount: number;
    emptyParsedCount: number;
    unparsedReceivedCount?: number;
  };
}

interface EmailParseFailureBannerProps {
  emailParse: ParseHealthStatus | null;
  isLoading: boolean;
  onRefetch: () => Promise<void>;
}

export function EmailParseFailureBanner({ emailParse, isLoading, onRefetch }: EmailParseFailureBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
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
  if (!emailParse || !emailParse.hasIssues || !isVisible) return null;

  const status = emailParse;
  const totalIssues =
    status.summary.failedCount +
    status.summary.stuckPendingCount +
    status.summary.emptyParsedCount +
    (status.summary.unparsedReceivedCount ?? 0);
  const recentFailures = status.failedFiles.slice(0, 3);
  const recentStuck = status.pendingFiles.slice(0, 2);
  const recentEmpty = status.emptyParsedFiles.slice(0, 2);

  return (
    <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 mb-4 shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <XCircle className="h-6 w-6 text-red-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-red-900">⚠️ Email Parsing Issues Detected</h3>
              <span className="text-sm text-red-700 bg-red-100 px-2 py-0.5 rounded">
                {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-2 text-sm text-red-800">
              {status.summary.failedCount > 0 && (
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <FileX className="h-4 w-4" />
                    {status.summary.failedCount} file{status.summary.failedCount !== 1 ? 's' : ''} failed to parse:
                  </p>
                  <ul className="ml-6 mt-1 space-y-1">
                    {recentFailures.map((file) => (
                      <li key={file.id} className="text-xs">
                        <span className="font-medium">{file.filename}</span>
                        {file.parse_error && (
                          <span className="text-red-600 ml-2">
                            - {file.parse_error.substring(0, 80)}
                            {file.parse_error.length > 80 ? '...' : ''}
                          </span>
                        )}
                        <span className="text-red-500 ml-2">({formatDate(file.created_at)})</span>
                      </li>
                    ))}
                    {status.summary.failedCount > 3 && (
                      <li className="text-xs text-red-600 italic">... and {status.summary.failedCount - 3} more</li>
                    )}
                  </ul>
                </div>
              )}

              {status.summary.stuckPendingCount > 0 && (
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {status.summary.stuckPendingCount} file{status.summary.stuckPendingCount !== 1 ? 's' : ''} stuck in pending:
                  </p>
                  <ul className="ml-6 mt-1 space-y-1">
                    {recentStuck.map((file) => (
                      <li key={file.id} className="text-xs">
                        <span className="font-medium">{file.filename}</span>
                        <span className="text-red-500 ml-2">(waiting since {formatDate(file.created_at)})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {status.summary.emptyParsedCount > 0 && (
                <div>
                  <p className="font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {status.summary.emptyParsedCount} file{status.summary.emptyParsedCount !== 1 ? 's' : ''} parsed but created 0 bookings:
                  </p>
                  <ul className="ml-6 mt-1 space-y-1">
                    {recentEmpty.map((file) => (
                      <li key={file.id} className="text-xs">
                        <span className="font-medium">{file.filename}</span>
                        <span className="text-red-500 ml-2">
                          (parsed {formatDate(file.parsed_at || file.created_at)})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-3">
              <Link href="/admin/bookings/email-imports" className="text-sm font-medium text-red-700 underline hover:text-red-900">
                View & Manage Issues →
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsVisible(false);
                  setTimeout(() => setIsVisible(true), 5 * 60 * 1000);
                }}
                className="text-xs"
              >
                Dismiss (5 min)
              </Button>
            </div>
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
  );
}
