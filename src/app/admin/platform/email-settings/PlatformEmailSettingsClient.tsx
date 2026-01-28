'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Eye, EyeOff, Mail } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface PlatformEmailSettings {
  id?: string;
  provider: string;
  resend_api_key_encrypted: string;
  default_from_email: string;
  default_from_name: string;
  default_reply_to: string | null;
  is_enabled: boolean;
}

interface PlatformEmailSettingsClientProps {
  initialSettings: PlatformEmailSettings | null;
}

export default function PlatformEmailSettingsClient({ initialSettings }: PlatformEmailSettingsClientProps) {
  const [settings, setSettings] = useState({
    resend_api_key: '', // Only for new input, not displayed
    default_from_email: initialSettings?.default_from_email || 'no-reply@myparkingchannel.app',
    default_from_name: initialSettings?.default_from_name || 'My Parking Channel',
    default_reply_to: initialSettings?.default_reply_to || '',
    is_enabled: initialSettings?.is_enabled ?? true,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch('/api/admin/platform/email-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resend_api_key: settings.resend_api_key || undefined, // Only send if provided
          default_from_email: settings.default_from_email,
          default_from_name: settings.default_from_name,
          default_reply_to: settings.default_reply_to || null,
          is_enabled: settings.is_enabled,
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

      // Clear API key field after saving
      setSettings({ ...settings, resend_api_key: '' });
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
          Platform Email Settings
        </h1>
        <p className="text-gray-600 mt-1">Configure Resend email provider for all tenants</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resend Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resend_api_key">Resend API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="resend_api_key"
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.resend_api_key}
                  onChange={(e) => setSettings({ ...settings, resend_api_key: e.target.value })}
                  placeholder={initialSettings ? 'Enter new API key to update (leave blank to keep existing)' : 'Enter Resend API key'}
                  required={!initialSettings}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                {initialSettings ? 'API key is stored encrypted. Enter a new key to update.' : 'API key will be stored encrypted.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="default_from_email">Default From Email</Label>
              <Input
                id="default_from_email"
                type="email"
                value={settings.default_from_email}
                onChange={(e) => setSettings({ ...settings, default_from_email: e.target.value })}
                placeholder="no-reply@myparkingchannel.app"
                required
              />
              <p className="text-xs text-gray-500">Default sender email for all tenants</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="default_from_name">Default From Name</Label>
              <Input
                id="default_from_name"
                value={settings.default_from_name}
                onChange={(e) => setSettings({ ...settings, default_from_name: e.target.value })}
                placeholder="My Parking Channel"
                required
              />
              <p className="text-xs text-gray-500">Default sender name for all tenants</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="default_reply_to">Default Reply-To Email (Optional)</Label>
              <Input
                id="default_reply_to"
                type="email"
                value={settings.default_reply_to}
                onChange={(e) => setSettings({ ...settings, default_reply_to: e.target.value })}
                placeholder="support@myparkingchannel.app"
              />
              <p className="text-xs text-gray-500">Default reply-to address</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="is_enabled">Email Enabled</Label>
                <p className="text-xs text-gray-500">Enable or disable email sending platform-wide</p>
              </div>
              <Switch
                id="is_enabled"
                checked={settings.is_enabled}
                onCheckedChange={(checked) => setSettings({ ...settings, is_enabled: checked })}
              />
            </div>

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
