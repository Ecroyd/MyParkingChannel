'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Save, Upload, Eye, EyeOff, Settings } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { saveAphChannelSettings, saveAphSftpCredentials, runAphExportNow } from '@/app/admin/integrations/aph/actions';
import { useRouter } from 'next/navigation';

type AphChannelCardProps = {
  tenantId: string;
  initialChannel: {
    id: string;
    enabled: boolean;
    config: any; // AphChannelConfig shape
    last_export_at: string | null;
  } | null;
  recentExports: {
    id: string;
    filename: string;
    rows_count: number;
    status: 'success' | 'failed';
    error_message: string | null;
    ran_at: string;
  }[];
};

export default function AphChannelCard({
  tenantId,
  initialChannel,
  recentExports,
}: AphChannelCardProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Local form state
  const [enabled, setEnabled] = useState(initialChannel?.enabled || false);
  const [supplierCode, setSupplierCode] = useState(
    initialChannel?.config?.supplierCode || initialChannel?.config?.supplier_code || ''
  );
  const [daysAhead, setDaysAhead] = useState(
    initialChannel?.config?.daysAhead || initialChannel?.config?.days_ahead || 365
  );
  const [sendFrequencyMinutes, setSendFrequencyMinutes] = useState(
    initialChannel?.config?.send_frequency_minutes || initialChannel?.config?.sendFrequencyMinutes || 60
  );
  const [channelId, setChannelId] = useState<string | null>(initialChannel?.id || null);
  const [lastExportAt, setLastExportAt] = useState<string | null>(initialChannel?.last_export_at || null);

  // SFTP credentials form state
  const [sftpHost, setSftpHost] = useState('');
  const [sftpPort, setSftpPort] = useState(22);
  const [sftpUsername, setSftpUsername] = useState('');
  const [sftpPassword, setSftpPassword] = useState('');
  const [sftpRemotePath, setSftpRemotePath] = useState('/');

  const handleSaveSettings = async () => {
    if (!supplierCode.trim()) {
      toast.error('Supplier code is required');
      return;
    }

    try {
      setSaving(true);
      const result = await saveAphChannelSettings({
        tenantId,
        enabled,
        supplierCode: supplierCode.trim(),
        daysAhead,
        send_frequency_minutes: sendFrequencyMinutes,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.success && result.channel) {
        setChannelId(result.channel.id);
        setLastExportAt(result.channel.last_export_at);
        toast.success('APH settings saved successfully');
        // Refresh to get updated exports
        router.refresh();
      }
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!sftpHost || !sftpUsername || !sftpPassword) {
      toast.error('Host, username, and password are required');
      return;
    }

    try {
      setSaving(true);
      const result = await saveAphSftpCredentials({
        tenantId,
        host: sftpHost,
        port: sftpPort,
        username: sftpUsername,
        password: sftpPassword,
        remotePath: sftpRemotePath,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.success) {
        toast.success('SFTP credentials saved successfully');
        setCredentialsDialogOpen(false);
        setSftpPassword(''); // Clear password field
      }
    } catch (error: any) {
      console.error('Error saving credentials:', error);
      toast.error('Failed to save credentials');
    } finally {
      setSaving(false);
    }
  };

  const handleRunExport = async () => {
    if (!channelId) {
      toast.error('Please save settings first to create the channel');
      return;
    }

    try {
      setExporting(true);
      const result = await runAphExportNow({ channelId });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.ok) {
        toast.success('Export triggered; refresh to see latest logs');
        // Refresh to get updated exports
        setTimeout(() => {
          router.refresh();
        }, 2000);
      }
    } catch (error: any) {
      console.error('Error running export:', error);
      toast.error('Failed to trigger export');
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'never';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'never';
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>APH SFTP (temporary pricing feed)</CardTitle>
          <CardDescription>
            Sends a CSV of your rates to APH via SFTP every {sendFrequencyMinutes} minutes. APH treats each file as a
            full refresh.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="enabled" className="text-base font-medium">
              Enable APH SFTP
            </Label>
            <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {/* Format (read-only) */}
          <div>
            <Label>Format</Label>
            <Input value="B.1 (1–30 days + extra day)" disabled className="bg-gray-50" />
            <p className="text-xs text-gray-500 mt-1">Only B.1 format is currently supported</p>
          </div>

          {/* Supplier Code */}
          <div>
            <Label htmlFor="supplierCode">Supplier Code *</Label>
            <Input
              id="supplierCode"
              value={supplierCode}
              onChange={(e) => setSupplierCode(e.target.value)}
              placeholder="e.g. ABC123"
            />
          </div>

          {/* Days Ahead */}
          <div>
            <Label htmlFor="daysAhead">Days ahead to send *</Label>
            <Input
              id="daysAhead"
              type="number"
              min="1"
              max="730"
              value={daysAhead}
              onChange={(e) => setDaysAhead(parseInt(e.target.value) || 365)}
              placeholder="365"
            />
          </div>

          {/* Frequency */}
          <div>
            <Label htmlFor="frequency">Frequency (minutes) *</Label>
            <Input
              id="frequency"
              type="number"
              min="1"
              value={sendFrequencyMinutes}
              onChange={(e) => setSendFrequencyMinutes(parseInt(e.target.value) || 60)}
              placeholder="60"
            />
            <p className="text-xs text-gray-500 mt-1">How often to send exports (e.g. 60, 360, 1440)</p>
          </div>

          {/* Last Export Info */}
          <div className="pt-2 border-t">
            <p className="text-sm text-gray-600">
              Last export: <span className="font-medium">{formatDate(lastExportAt)}</span>
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4">
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save APH settings
                </>
              )}
            </Button>
            <Button variant="outline" onClick={() => setCredentialsDialogOpen(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Edit SFTP credentials
            </Button>
            <Button variant="ghost" size="sm" onClick={handleRunExport} disabled={exporting || !channelId}>
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Run export now
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Exports Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent APH exports</CardTitle>
        </CardHeader>
        <CardContent>
          {recentExports.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No exports yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Filename</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentExports.map((exp) => (
                  <TableRow key={exp.id}>
                    <TableCell>{formatDate(exp.ran_at)}</TableCell>
                    <TableCell className="font-mono text-xs max-w-xs truncate" title={exp.filename || ''}>
                      {exp.filename || '—'}
                    </TableCell>
                    <TableCell>{exp.rows_count}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          exp.status === 'success'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {exp.status === 'success' ? 'Success' : 'Failed'}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-red-600" title={exp.error_message || ''}>
                      {exp.error_message || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* SFTP Credentials Modal */}
      <Dialog open={credentialsDialogOpen} onOpenChange={setCredentialsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit SFTP Credentials</DialogTitle>
            <DialogDescription>
              Configure SFTP connection details for uploading rate files to APH
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sftp_host">Host *</Label>
                <Input
                  id="sftp_host"
                  value={sftpHost}
                  onChange={(e) => setSftpHost(e.target.value)}
                  placeholder="sftp.example.com"
                />
              </div>
              <div>
                <Label htmlFor="sftp_port">Port *</Label>
                <Input
                  id="sftp_port"
                  type="number"
                  min="1"
                  max="65535"
                  value={sftpPort}
                  onChange={(e) => setSftpPort(parseInt(e.target.value) || 22)}
                  placeholder="22"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="sftp_username">Username *</Label>
              <Input
                id="sftp_username"
                value={sftpUsername}
                onChange={(e) => setSftpUsername(e.target.value)}
                placeholder="sftp_user"
              />
            </div>

            <div>
              <Label htmlFor="sftp_password">Password *</Label>
              <div className="flex gap-2">
                <Input
                  id="sftp_password"
                  type={showPassword ? 'text' : 'password'}
                  value={sftpPassword}
                  onChange={(e) => setSftpPassword(e.target.value)}
                  placeholder="Enter password"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="sftp_remotePath">Remote Path</Label>
              <Input
                id="sftp_remotePath"
                value={sftpRemotePath}
                onChange={(e) => setSftpRemotePath(e.target.value)}
                placeholder="/incoming/rates/SUPPLIER/"
              />
              <p className="text-xs text-gray-500 mt-1">
                Directory on SFTP server where files will be uploaded (default: /)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCredentialsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCredentials} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Credentials'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
