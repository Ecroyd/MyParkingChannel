'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Trash2, Play, AlertCircle, Clock, FileX, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface EmailFile {
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
  staging_count?: number;
  booking_count?: number;
}

interface ParseHealthStatus {
  ok: boolean;
  hasIssues: boolean;
  failedFiles: EmailFile[];
  pendingFiles: EmailFile[];
  emptyParsedFiles: EmailFile[];
  summary: {
    failedCount: number;
    stuckPendingCount: number;
    emptyParsedCount: number;
  };
}

export default function EmailImportsClient({ tenantId }: { tenantId: string }) {
  const [status, setStatus] = useState<ParseHealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/email-parse/health');
      const data = await res.json();
      if (data.ok) {
        setStatus(data);
      }
    } catch (err) {
      console.error('[EMAIL IMPORTS] Failed to fetch', err);
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

  const handleRetry = async (fileId: string) => {
    setProcessing(prev => new Set(prev).add(fileId));
    try {
      const res = await fetch('/api/admin/ingest/parse-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, tenantId }),
      });
      const result = await res.json();
      if (res.ok) {
        alert(`✅ Retry successful!\n\nRows parsed: ${result.rowsParsed || 0}\nBookings imported: ${result.importResult?.successCount || 0}\nErrors: ${result.importResult?.errorCount || 0}`);
        await fetchStatus(); // Refresh
      } else {
        alert(`❌ Retry failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setProcessing(prev => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  const handleDelete = async (fileId: string, filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"?\n\nThis will remove the file record but keep the email.`)) {
      return;
    }

    setProcessing(prev => new Set(prev).add(fileId));
    try {
      const res = await fetch(`/api/admin/ingest/delete-file`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });
      const result = await res.json();
      if (res.ok) {
        alert('✅ File deleted successfully');
        await fetchStatus(); // Refresh
      } else {
        alert(`❌ Delete failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setProcessing(prev => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

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

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading email import status...
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="p-6">
        <div className="text-red-600">Failed to load status</div>
      </div>
    );
  }

  const allFiles = [
    ...status.failedFiles.map(f => ({ ...f, category: 'failed' as const })),
    ...status.pendingFiles.map(f => ({ ...f, category: 'pending' as const })),
    ...status.emptyParsedFiles.map(f => ({ ...f, category: 'empty' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Email Import Status</h1>
          <p className="text-muted-foreground mt-1">
            Manage failed, stuck, or empty email imports
          </p>
        </div>
        <Button onClick={fetchStatus} variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Failed Files</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{status.summary.failedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stuck Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{status.summary.stuckPendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Empty Parsed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{status.summary.emptyParsedCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Files List */}
      {allFiles.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p className="text-lg font-medium">No issues found!</p>
            <p className="text-sm">All email imports are processing correctly.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {allFiles.map((file) => {
            const isProcessing = processing.has(file.id);
            const email = file.ingest_emails;

            return (
              <Card key={file.id} className={file.category === 'failed' ? 'border-red-200' : file.category === 'pending' ? 'border-amber-200' : 'border-orange-200'}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {file.category === 'failed' && <FileX className="h-5 w-5 text-red-600" />}
                        {file.category === 'pending' && <Clock className="h-5 w-5 text-amber-600" />}
                        {file.category === 'empty' && <AlertCircle className="h-5 w-5 text-orange-600" />}
                        <CardTitle className="text-lg">{file.filename}</CardTitle>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          file.category === 'failed' ? 'bg-red-100 text-red-700' :
                          file.category === 'pending' ? 'bg-amber-100 text-amber-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {file.category === 'failed' ? 'Failed' : file.category === 'pending' ? 'Stuck Pending' : 'Empty Parsed'}
                        </span>
                      </div>
                      <CardDescription>
                        <div className="space-y-1 text-sm">
                          <div>
                            <span className="font-medium">From:</span> {email.from_address}
                          </div>
                          <div>
                            <span className="font-medium">Subject:</span> {email.subject || '(no subject)'}
                          </div>
                          <div>
                            <span className="font-medium">Created:</span> {formatDate(file.created_at)}
                          </div>
                          {file.parsed_at && (
                            <div>
                              <span className="font-medium">Parsed:</span> {formatDate(file.parsed_at)}
                            </div>
                          )}
                          {file.parse_error && (
                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-800 text-xs">
                              <span className="font-medium">Error:</span> {file.parse_error}
                            </div>
                          )}
                          {file.category === 'empty' && (
                            <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-orange-800 text-xs">
                              File was parsed but created 0 bookings. This may indicate a format issue or empty file.
                            </div>
                          )}
                        </div>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {(file.category === 'failed' || file.category === 'pending' || file.category === 'empty') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRetry(file.id)}
                          disabled={isProcessing}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          {isProcessing ? 'Processing...' : 'Retry'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(file.id, file.filename)}
                        disabled={isProcessing}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
