'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Mail } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface TenantEmailSettings {
  tenant_id: string;
  from_name: string | null;
  reply_to: string | null;
  sender_domain_mode: 'platform' | 'tenant_domain';
  tenant_from_email: string | null;
}

interface TenantEmailSettingsClientProps {
  initialSettings: TenantEmailSettings | null;
  tenantName: string;
  tenantId: string;
}

export default function TenantEmailSettingsClient({
  initialSettings,
  tenantName,
  tenantId,
}: TenantEmailSettingsClientProps) {
  const [settings, setSettings] = useState({
    from_name: initialSettings?.from_name || '',
    reply_to: initialSettings?.reply_to || '',
    sender_domain_mode: initialSettings?.sender_domain_mode || 'platform' as 'platform' | 'tenant_domain',
    tenant_from_email: initialSettings?.tenant_from_email || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch('/api/admin/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          from_name: settings.from_name || null,
          reply_to: settings.reply_to || null,
          sender_domain_mode: settings.sender_domain_mode,
          tenant_from_email: settings.sender_domain_mode === 'tenant_domain' ? (settings.tenant_from_email || null) : null,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save settings');
      }

      toast({
        title: 'Success',
        description: 'Email settings saved successfully',
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

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Mail className="h-6 w-6" />
          Email Settings
        </h1>
        <p className="text-gray-600 mt-1">Configure email settings for {tenantName}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant Email Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                Email address for replies. If empty, platform default will be used.
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
                Choose whether to send from platform domain or your own domain (requires domain verification).
              </p>
            </div>

            {settings.sender_domain_mode === 'tenant_domain' && (
              <div className="space-y-2">
                <Label htmlFor="tenant_from_email">Tenant From Email</Label>
                <Input
                  id="tenant_from_email"
                  type="email"
                  value={settings.tenant_from_email}
                  onChange={(e) => setSettings({ ...settings, tenant_from_email: e.target.value })}
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
