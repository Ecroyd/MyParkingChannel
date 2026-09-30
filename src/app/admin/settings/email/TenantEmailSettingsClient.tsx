'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Mail, Send } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  normalizeEmailList,
  partitionBookingNotifyEmails,
} from '@/lib/email/tenantNotifyEmail';

interface TenantEmailSettings {
  tenant_id: string;
  from_name: string | null;
  reply_to: string | null;
  booking_notify_emails?: string[] | null;
  booking_notify_email?: string | null;
  sender_domain_mode: 'platform' | 'tenant_domain';
  tenant_from_email: string | null;
}

interface TenantEmailSettingsClientProps {
  initialSettings: TenantEmailSettings | null;
  tenantName: string;
  tenantId: string;
}

function initialNotifyPartition(settings: TenantEmailSettings | null) {
  const fromArray = normalizeEmailList(settings?.booking_notify_emails);
  const raw = fromArray.length > 0 ? fromArray : normalizeEmailList(settings?.booking_notify_email);
  return partitionBookingNotifyEmails(raw);
}

export default function TenantEmailSettingsClient({
  initialSettings,
  tenantName,
  tenantId,
}: TenantEmailSettingsClientProps) {
  const initialPartition = useMemo(
    () => initialNotifyPartition(initialSettings),
    [initialSettings]
  );
  const [settings, setSettings] = useState({
    from_name: initialSettings?.from_name || '',
    reply_to: initialSettings?.reply_to || '',
    // Strip ingest addresses from the editable field immediately so Save cannot
    // re-persist bookings@ after someone typed it by mistake.
    booking_notify_emails_text: initialPartition.allowed.join('\n'),
    sender_domain_mode:
      initialSettings?.sender_domain_mode || ('platform' as 'platform' | 'tenant_domain'),
    tenant_from_email: initialSettings?.tenant_from_email || '',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{
    kind: 'ok' | 'error';
    message: string;
  } | null>(null);
  const [strippedIngestNotice, setStrippedIngestNotice] = useState(
    initialPartition.blocked.length > 0 ? initialPartition.blocked : null
  );

  const { allowed: parsedNotifyEmails, blocked: blockedIngestEmails } = useMemo(
    () => partitionBookingNotifyEmails(settings.booking_notify_emails_text),
    [settings.booking_notify_emails_text]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (blockedIngestEmails.length > 0) {
      toast({
        title: 'Invalid notification recipient',
        description: `Do not use ${blockedIngestEmails.join(', ')}. That address is for Cloudflare inbound booking ingest, not staff alerts.`,
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      const response = await fetch('/api/admin/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          from_name: settings.from_name || null,
          reply_to: settings.reply_to || null,
          booking_notify_emails: parsedNotifyEmails,
          sender_domain_mode: settings.sender_domain_mode,
          tenant_from_email:
            settings.sender_domain_mode === 'tenant_domain'
              ? settings.tenant_from_email || null
              : null,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || `Failed to save settings (${response.status})`);
      }

      toast({
        title: 'Success',
        description: 'Email & notification settings saved',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (blockedIngestEmails.length > 0) {
      const message = `Remove ${blockedIngestEmails.join(', ')} — that is the ingest inbox, not a notification recipient.`;
      setTestStatus({ kind: 'error', message });
      toast({
        title: 'Invalid recipient',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    if (parsedNotifyEmails.length === 0) {
      const message = 'Enter at least one email under New booking notifications.';
      setTestStatus({ kind: 'error', message });
      toast({
        title: 'Add an address first',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    setTesting(true);
    setTestStatus(null);
    try {
      const response = await fetch('/api/admin/settings/email/test-booking-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          booking_notify_emails: parsedNotifyEmails,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        const detail =
          result.error ||
          (Array.isArray(result.failed) && result.failed[0]?.error) ||
          `Failed to send test email (${response.status})`;
        throw new Error(detail);
      }
      const message = result.message || `Sent to ${parsedNotifyEmails.join(', ')}`;
      setTestStatus({ kind: 'ok', message });
      toast({
        title: 'Test sent',
        description: message,
      });
    } catch (error: any) {
      const message = error.message || 'Failed to send test email';
      setTestStatus({ kind: 'error', message });
      toast({
        title: 'Test failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Mail className="h-6 w-6" />
          Email &amp; Notifications
        </h1>
        <p className="text-gray-600 mt-1">
          Configure outbound email and who receives new booking alerts for {tenantName}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>New booking notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {strippedIngestNotice && (
              <div
                role="status"
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              >
                <p className="font-medium">Ingest address removed from this list</p>
                <p className="mt-1">
                  {strippedIngestNotice.join(', ')} is the Cloudflare inbox for supplier booking
                  emails (ParkVia, Holiday Extras, etc.). Mail Resend sends there is re-ingested
                  and will not show as a booking in the app or reach your staff. Enter a real
                  staff inbox below (for example info@yourparking.com), then Save and Send test
                  email.
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs underline"
                  onClick={() => setStrippedIngestNotice(null)}
                >
                  Dismiss
                </button>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="booking_notify_emails">Notification recipients</Label>
              <Textarea
                id="booking_notify_emails"
                value={settings.booking_notify_emails_text}
                onChange={(e) =>
                  setSettings({ ...settings, booking_notify_emails_text: e.target.value })
                }
                placeholder={'ops@yourparking.com\nmanager@yourparking.com'}
                rows={4}
              />
              <p className="text-xs text-gray-500">
                One or more staff inboxes (comma or new line separated). Internal “New booking”
                alerts for manual and website bookings are sent directly via Resend to these
                addresses. Leave empty to disable internal booking alerts (customer confirmations
                are unchanged). Do not use{' '}
                <code className="text-[11px]">bookings@myparkingchannel.app</code> — that is the
                Cloudflare ingest address for supplier booking emails, not a notification
                mailbox. Mail sent there is re-ingested and will not appear as a booking or reach
                your staff.
              </p>
              {blockedIngestEmails.length > 0 && (
                <p className="text-xs text-red-700">
                  Remove ingest address
                  {blockedIngestEmails.length === 1 ? '' : 'es'}:{' '}
                  {blockedIngestEmails.join(', ')}. Use a real staff email instead.
                </p>
              )}
              {parsedNotifyEmails.length > 0 && (
                <p className="text-xs text-gray-700">
                  {parsedNotifyEmails.length} recipient
                  {parsedNotifyEmails.length === 1 ? '' : 's'}: {parsedNotifyEmails.join(', ')}
                </p>
              )}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleSendTest}
              disabled={
                testing ||
                parsedNotifyEmails.length === 0 ||
                blockedIngestEmails.length > 0
              }
            >
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending test…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send test email
                </>
              )}
            </Button>

            {testStatus && (
              <div
                role="status"
                className={
                  testStatus.kind === 'ok'
                    ? 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900'
                    : 'rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900'
                }
              >
                {testStatus.message}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sender settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="from_name">From Name (Optional)</Label>
              <Input
                id="from_name"
                value={settings.from_name}
                onChange={(e) => setSettings({ ...settings, from_name: e.target.value })}
                placeholder={`e.g. ${tenantName}`}
              />
              <p className="text-xs text-gray-500">
                Override the default sender name. If empty, platform default will be used.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reply_to">Reply-To Email (Optional)</Label>
              <Input
                id="reply_to"
                type="email"
                value={settings.reply_to}
                onChange={(e) => setSettings({ ...settings, reply_to: e.target.value })}
                placeholder="support@yourdomain.com"
              />
              <p className="text-xs text-gray-500">
                Used when customers reply to confirmation emails. Not used as the “New booking”
                notification destination.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sender_domain_mode">Sender Domain Mode</Label>
              <Select
                value={settings.sender_domain_mode}
                onValueChange={(value: 'platform' | 'tenant_domain') =>
                  setSettings({ ...settings, sender_domain_mode: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform">Platform Domain (Default)</SelectItem>
                  <SelectItem value="tenant_domain">Tenant Domain (Future)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Choose whether to send from platform domain or your own domain (requires domain
                verification).
              </p>
            </div>

            {settings.sender_domain_mode === 'tenant_domain' && (
              <div className="space-y-2">
                <Label htmlFor="tenant_from_email">Tenant From Email</Label>
                <Input
                  id="tenant_from_email"
                  type="email"
                  value={settings.tenant_from_email}
                  onChange={(e) =>
                    setSettings({ ...settings, tenant_from_email: e.target.value })
                  }
                  placeholder="no-reply@yourdomain.com"
                  required={settings.sender_domain_mode === 'tenant_domain'}
                />
                <p className="text-xs text-gray-500">
                  Email address from your verified domain.
                </p>
              </div>
            )}

            <Button type="submit" disabled={saving} className="w-full">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
