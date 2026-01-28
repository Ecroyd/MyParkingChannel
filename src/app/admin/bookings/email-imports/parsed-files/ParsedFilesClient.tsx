'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ParsedFile {
  file_id: string;
  filename: string;
  parse_status: string;
  parsed_at: string;
  file_created: string;
  from_address: string;
  subject: string;
  email_received: string;
  detected_channel: string | null;
  staging_source?: string | null;
  booking_external_source: string | null;
  booking_source: string | null;
  bookings_created: number;
  sample_references?: string[];
  has_source_issue?: boolean; // Single source of truth flag from API
  parser_key?: string | null;
  external_source?: string | null;
  attribution_confidence?: string | null;
}

interface BookingWithSource {
  booking_id: string;
  reference: string;
  customer_name: string;
  plate: string;
  start_at: string;
  end_at: string;
  money_charged: number;
  source: string;
  external_source: string;
  booking_created: string;
  source_file: string;
  file_parsed_at: string;
  email_from: string;
  detected_channel: string | null;
  verification: string;
}

export default function ParsedFilesClient({ tenantId }: { tenantId: string }) {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [bookings, setBookings] = useState<BookingWithSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'files' | 'bookings'>('files');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/email-parse/parsed-files');
      const data = await res.json();
      if (data.ok) {
        setFiles(data.files || []);
        setBookings(data.bookings || []);
      }
    } catch (err) {
      console.error('[PARSED FILES] Failed to fetch:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Only fetch on mount, no auto-refresh
  }, []);

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

  const getSourceStatus = (file: ParsedFile) => {
    // Use has_source_issue flag from API if available (single source of truth)
    if ('has_source_issue' in file && file.has_source_issue === true) {
      const channel = file.detected_channel || 'Unknown';
      const bookingSource = file.booking_source || 'Not set';
      const externalSource = file.booking_external_source || 'Not set';
      return { 
        status: 'incorrect', 
        message: `⚠️ ${channel} file tagged as ${bookingSource}/${externalSource}`, 
        icon: AlertTriangle, 
        color: 'text-red-600' 
      };
    }

    // Fallback to calculation if flag not available
    const channel = file.detected_channel;
    const bookingSource = file.booking_source;
    const externalSource = file.booking_external_source;

    if (!channel || !bookingSource || !externalSource) {
      return { status: 'unknown', message: 'Source not yet set', icon: AlertTriangle, color: 'text-gray-600' };
    }

    if (channel === 'CAVU' && bookingSource === 'cavu' && externalSource === 'CAVU Email Import') {
      return { status: 'correct', message: '✅ CAVU source correct', icon: CheckCircle2, color: 'text-green-600' };
    }
    if (channel === 'HOLIDAY_EXTRAS' && bookingSource === 'holidayextras' && externalSource === 'Holiday Extras Email Import') {
      return { status: 'correct', message: '✅ Holiday Extras source correct', icon: CheckCircle2, color: 'text-green-600' };
    }
    if (channel === 'APH' && bookingSource === 'other' && externalSource === 'APH Email Import') {
      return { status: 'correct', message: '✅ APH source correct', icon: CheckCircle2, color: 'text-green-600' };
    }
    if (channel === 'FLYPARKS_EMAIL' && bookingSource === 'other' && externalSource === 'Flyparks Email Import') {
      return { status: 'correct', message: '✅ Flyparks source correct', icon: CheckCircle2, color: 'text-green-600' };
    }

    return { 
      status: 'incorrect', 
      message: `⚠️ ${channel} file tagged as ${bookingSource}/${externalSource}`, 
      icon: AlertTriangle, 
      color: 'text-red-600' 
    };
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading parsed files...
        </div>
      </div>
    );
  }

  const filesWithIssues = files.filter(f => getSourceStatus(f).status === 'incorrect');
  const recentBookings = bookings.slice(0, 20);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Parsed Files & Source Verification</h1>
          <p className="text-muted-foreground mt-1">
            Verify that files are parsed correctly and sources are attributed properly for billing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={view === 'files' ? 'default' : 'outline'}
            onClick={() => setView('files')}
          >
            <FileText className="h-4 w-4 mr-2" />
            Files ({files.length})
          </Button>
          <Button
            variant={view === 'bookings' ? 'default' : 'outline'}
            onClick={() => setView('bookings')}
          >
            Recent Bookings ({recentBookings.length})
          </Button>
          <Button onClick={fetchData} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Parsed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{files.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Source Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${filesWithIssues.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {filesWithIssues.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {files.reduce((sum, f) => sum + (f.bookings_created || 0), 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              £{bookings.reduce((sum, b) => sum + (b.money_charged || 0), 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Files View */}
      {view === 'files' && (
        <div className="space-y-4">
          {filesWithIssues.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="text-red-900">⚠️ Files with Source Issues</CardTitle>
                <CardDescription>
                  These files have incorrect source attribution and need attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filesWithIssues.map((file) => {
                    const status = getSourceStatus(file);
                    const Icon = status.icon;
                    return (
                      <div key={file.file_id} className="p-3 bg-white rounded border border-red-200">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className={`h-5 w-5 ${status.color}`} />
                              <span className="font-medium">{file.filename}</span>
                            </div>
                            <div className="text-sm space-y-1 text-gray-600">
                              <div><span className="font-medium">Detected:</span> {file.detected_channel || 'Unknown'}</div>
                              <div><span className="font-medium">Booking Source:</span> {file.booking_source || 'Not set'}</div>
                              <div><span className="font-medium">External Source:</span> {file.booking_external_source || 'Not set'}</div>
                              <div><span className="font-medium">From:</span> {file.from_address}</div>
                              <div><span className="font-medium">Parsed:</span> {formatDate(file.parsed_at)}</div>
                              <div><span className="font-medium">Bookings:</span> {file.bookings_created || 0}</div>
                              {file.sample_references && file.sample_references.length > 0 && (
                                <div>
                                  <span className="font-medium">Sample References:</span>{' '}
                                  <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                                    {file.sample_references.slice(0, 3).join(', ')}
                                    {file.sample_references.length > 3 && ` +${file.sample_references.length - 3} more`}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className={`px-3 py-1 rounded text-sm font-medium ${status.color} bg-white border`}>
                            {status.message}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>All Parsed Files (Last 7 Days)</CardTitle>
              <CardDescription>
                {files.length} files parsed, {filesWithIssues.length} with source issues
              </CardDescription>
            </CardHeader>
            <CardContent>
              {files.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No parsed files found in the last 7 days
                </div>
              ) : (
                <div className="space-y-3">
                  {files.map((file) => {
                    const status = getSourceStatus(file);
                    const Icon = status.icon;
                    return (
                      <div key={file.file_id} className={`p-4 rounded border ${status.status === 'incorrect' ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className={`h-5 w-5 ${status.color}`} />
                              <span className="font-semibold">{file.filename}</span>
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-100">
                                {file.detected_channel || 'Unknown'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                              <div>
                                <span className="font-medium">Source:</span> {file.booking_source || '—'}
                              </div>
                              <div>
                                <span className="font-medium">External:</span> {file.booking_external_source || '—'}
                              </div>
                              <div>
                                <span className="font-medium">Bookings:</span> {file.bookings_created || 0}
                              </div>
                              <div>
                                <span className="font-medium">Parsed:</span> {formatDate(file.parsed_at)}
                              </div>
                            </div>
                            {file.sample_references && file.sample_references.length > 0 && (
                              <div className="text-sm mt-2">
                                <span className="font-medium">Sample References:</span>{' '}
                                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                                  {file.sample_references.slice(0, 5).join(', ')}
                                  {file.sample_references.length > 5 && ` +${file.sample_references.length - 5} more`}
                                </span>
                              </div>
                            )}
                            <div className="text-xs text-gray-500 mt-1">
                              From: {file.from_address} • Subject: {file.subject || '(no subject)'}
                            </div>
                          </div>
                          <div className={`ml-4 px-3 py-1 rounded text-xs font-medium ${status.color} bg-white border`}>
                            {status.message}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bookings View */}
      {view === 'bookings' && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Bookings with Source Trace</CardTitle>
            <CardDescription>
              Last 20 bookings showing their source files and verification status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bookings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No recent bookings found
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Reference</th>
                      <th className="text-left p-2">Customer</th>
                      <th className="text-left p-2">Plate</th>
                      <th className="text-left p-2">Source</th>
                      <th className="text-left p-2">External Source</th>
                      <th className="text-left p-2">File</th>
                      <th className="text-left p-2">Channel</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => {
                      const isCorrect = booking.verification.includes('✅');
                      return (
                        <tr key={booking.booking_id} className={`border-b ${!isCorrect ? 'bg-red-50' : ''}`}>
                          <td className="p-2 font-medium">{booking.reference}</td>
                          <td className="p-2">{booking.customer_name}</td>
                          <td className="p-2">{booking.plate}</td>
                          <td className="p-2">{booking.source}</td>
                          <td className="p-2">{booking.external_source}</td>
                          <td className="p-2 text-xs">{booking.source_file}</td>
                          <td className="p-2 text-xs">{booking.detected_channel || '—'}</td>
                          <td className="p-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {booking.verification}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
