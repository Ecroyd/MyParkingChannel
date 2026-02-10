'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Trash2, Play, AlertCircle, Clock, FileX, CheckCircle2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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

interface RecentImport {
  email_id: string;
  from_address: string | null;
  subject: string | null;
  received_at: string;
  success: boolean;
  pipeline_status: string;
}

type FilePreview = {
  id: string;
  filename: string;
  content_type: string | null;
  file_size: number | null;
  truncated: boolean;
  preview: string;
} | null;

export default function EmailImportsClient({ tenantId }: { tenantId: string }) {
  const [status, setStatus] = useState<ParseHealthStatus | null>(null);
  const [recentImports, setRecentImports] = useState<RecentImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreview>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      console.log('[EMAIL IMPORTS] Fetching status from health endpoint...');
      const res = await fetch('/api/admin/email-parse/health');
      const data = await res.json();
      console.log('[EMAIL IMPORTS] Health endpoint response:', {
        ok: data.ok,
        hasIssues: data.hasIssues,
        summary: data.summary,
        failedCount: data.failedFiles?.length || 0,
        pendingCount: data.pendingFiles?.length || 0,
        emptyCount: data.emptyParsedFiles?.length || 0,
      });
      if (data.ok) {
        setStatus(data);
        console.log('[EMAIL IMPORTS] Status updated in state');
      }
    } catch (err) {
      console.error('[EMAIL IMPORTS] Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentImports = async () => {
    try {
      const res = await fetch('/api/admin/ingest/recent');
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.emails)) {
        setRecentImports(data.emails);
      }
    } catch (err) {
      console.error('[EMAIL IMPORTS] Failed to fetch recent imports:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchRecentImports();
  }, []);

  const handleRetry = async (fileId: string) => {
    console.log('[EMAIL IMPORTS] Starting retry for file:', fileId);
    setProcessing(prev => new Set(prev).add(fileId));
    try {
      console.log('[EMAIL IMPORTS] Calling parse-file API...');
      const res = await fetch('/api/admin/ingest/parse-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, tenantId }),
      });
      const result = await res.json();
      console.log('[EMAIL IMPORTS] Parse result:', {
        ok: res.ok,
        result,
        statusCode: res.status,
      });
      
      if (res.ok) {
        const message = `✅ Retry successful!\n\nRows parsed: ${result.rowsParsed || 0}\nBookings imported: ${result.importResult?.successCount || 0}\nErrors: ${result.importResult?.errorCount || 0}`;
        console.log('[EMAIL IMPORTS] Success message:', message);
        alert(message);
        
        // Wait a moment for database to update
        console.log('[EMAIL IMPORTS] Waiting 1 second before refresh...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('[EMAIL IMPORTS] Refreshing status...');
        await fetchStatus();
        await fetchRecentImports();
        console.log('[EMAIL IMPORTS] Status refreshed');
      } else {
        console.error('[EMAIL IMPORTS] Retry failed:', result);
        alert(`❌ Retry failed: ${result.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error('[EMAIL IMPORTS] Error during retry:', err);
      alert(`❌ Error: ${err.message}`);
    } finally {
      setProcessing(prev => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
      console.log('[EMAIL IMPORTS] Retry handler finished');
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
        await fetchStatus();
        await fetchRecentImports();
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

  const openPreview = async (fileId: string) => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const res = await fetch(`/api/admin/email-imports/file-preview?fileId=${encodeURIComponent(fileId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to load preview');
      setPreview(json);
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
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

  console.log('[EMAIL IMPORTS] All files to display:', {
    total: allFiles.length,
    byCategory: {
      failed: status.failedFiles.length,
      pending: status.pendingFiles.length,
      empty: status.emptyParsedFiles.length,
    },
    fileIds: allFiles.map(f => ({ id: f.id, filename: f.filename, category: f.category })),
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Email Import Status</h1>
          <p className="text-muted-foreground mt-1">
            Manage failed, stuck, or empty email imports
          </p>
        </div>
        <Button
          onClick={() => {
            fetchStatus();
            fetchRecentImports();
          }}
          variant="outline"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Last 10 emails imported — tick when successful */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent imports</CardTitle>
          <CardDescription>
            Last 10 emails that were imported. A tick indicates the import was successful.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentImports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent imports yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentImports.map((item) => (
                <li
                  key={item.email_id}
                  className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0"
                >
                  {item.success ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" aria-label="Success" />
                  ) : (
                    <span className="w-5 h-5 flex-shrink-0" aria-hidden />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {item.subject || '(no subject)'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      From: {item.from_address || '—'} · {formatDate(item.received_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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
        <>
          {/* Bulk Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bulk Actions</CardTitle>
              <CardDescription>
                Clean up old empty files (older than 7 days with no bookings)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={async () => {
                    const oldEmptyFiles = allFiles.filter(f => {
                      const fileDate = new Date(f.created_at);
                      const daysOld = (Date.now() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
                      return daysOld > 7 && (f.category === 'empty' || f.category === 'pending');
                    });
                    
                    if (oldEmptyFiles.length === 0) {
                      alert('No old empty files found (older than 7 days)');
                      return;
                    }
                    
                    if (!confirm(`Delete ${oldEmptyFiles.length} old empty file(s)?\n\nThis will permanently remove these file records.`)) {
                      return;
                    }
                    
                    setProcessing(prev => {
                      const next = new Set(prev);
                      oldEmptyFiles.forEach(f => next.add(f.id));
                      return next;
                    });
                    
                    let deleted = 0;
                    let failed = 0;
                    
                    for (const file of oldEmptyFiles) {
                      try {
                        const res = await fetch(`/api/admin/ingest/delete-file`, {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ fileId: file.id }),
                        });
                        if (res.ok) {
                          deleted++;
                        } else {
                          failed++;
                        }
                      } catch (err) {
                        failed++;
                      }
                    }
                    
                    alert(`✅ Deleted ${deleted} file(s)\n${failed > 0 ? `❌ Failed to delete ${failed} file(s)` : ''}`);
                    await fetchStatus();
                    await fetchRecentImports();
                  }}
                  disabled={processing.size > 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Old Empty Files (7+ days)
                </Button>
                <span className="text-sm text-muted-foreground">
                  {allFiles.filter(f => {
                    const fileDate = new Date(f.created_at);
                    const daysOld = (Date.now() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
                    return daysOld > 7 && (f.category === 'empty' || f.category === 'pending');
                  }).length} old files found
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      
      {allFiles.length > 0 && (
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
                            {(() => {
                              const fileDate = new Date(file.created_at);
                              const daysOld = (Date.now() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
                              if (daysOld > 1) {
                                return <span className="text-muted-foreground ml-2">({Math.floor(daysOld)} days ago)</span>;
                              }
                              return null;
                            })()}
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
                              <div className="font-medium mb-1">File was parsed but created 0 bookings.</div>
                              <div>This usually means the file is empty, has no valid data rows, or all rows were skipped (e.g., missing vehicle registration).</div>
                              {(() => {
                                const fileDate = new Date(file.created_at);
                                const daysOld = (Date.now() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
                                if (daysOld > 7) {
                                  return <div className="mt-1 text-orange-600 font-medium">⚠️ This file is {Math.floor(daysOld)} days old - consider deleting it.</div>;
                                }
                                return null;
                              })()}
                            </div>
                          )}
                          {file.category === 'pending' && (
                            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
                              <div className="font-medium mb-1">File is stuck in pending status.</div>
                              <div>This usually means parsing was never triggered or failed silently. Try retrying or delete if it's an old test file.</div>
                              {(() => {
                                const fileDate = new Date(file.created_at);
                                const daysOld = (Date.now() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
                                if (daysOld > 7) {
                                  return <div className="mt-1 text-amber-600 font-medium">⚠️ This file is {Math.floor(daysOld)} days old - consider deleting it.</div>;
                                }
                                return null;
                              })()}
                            </div>
                          )}
                        </div>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className="px-2 py-1 rounded-md border text-sm"
                        onClick={() => openPreview(file.id)}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        View file
                      </Button>
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

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{preview?.filename ?? 'File preview'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex flex-col">
            {previewLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {previewError && <div className="text-sm text-red-600">{previewError}</div>}
            {preview?.preview != null && (
              <pre className="text-xs whitespace-pre-wrap max-h-[60vh] overflow-auto border rounded-md p-3 bg-muted/30">
                {preview.preview}
                {preview.truncated ? '\n\n…(truncated)' : ''}
              </pre>
            )}
            {preview && !previewLoading && !previewError && (
              <p className="text-xs text-muted-foreground mt-2">
                {preview.filename}
                {preview.file_size != null && ` · ${(preview.file_size / 1024).toFixed(1)} KB`}
                {preview.truncated && ' · first 200 KB shown'}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
