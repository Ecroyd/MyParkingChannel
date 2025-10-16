'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface StripeConnection {
  connected: boolean;
  accountId?: string;
  mode?: 'test' | 'live';
  error?: string;
}

export default function StripeIntegrationPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [tenantId, setTenantId] = useState<string>('');
  const [connection, setConnection] = useState<StripeConnection | null>(null);
  const [pk, setPk] = useState('');
  const [sk, setSk] = useState('');
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get tenant ID
      const { data: userTenant } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('is_default', true)
        .limit(1)
        .maybeSingle();
      
      if (userTenant?.tenant_id) {
        setTenantId(userTenant.tenant_id);
        
        // Check Stripe connection status
        const response = await fetch('/api/payments/connect/status');
        if (response.ok) {
          const status = await response.json();
          setConnection(status);
        }

        // Load manual keys if any
        const { data: secrets } = await supabase
          .from('tenant_secrets')
          .select('key, value_ciphertext')
          .eq('tenant_id', userTenant.tenant_id);

        secrets?.forEach(s => {
          if (s.key === 'stripe.publishable_key') setPk(s.value_ciphertext);
          if (s.key === 'stripe.secret_key') setSk(s.value_ciphertext);
        });
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setMsg('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!tenantId) return;
    setSaving(true);
    setMsg('');

    const upserts = [
      { tenant_id: tenantId, key: 'stripe.publishable_key', scope: 'payments', value_ciphertext: pk },
      { tenant_id: tenantId, key: 'stripe.secret_key', scope: 'payments', value_ciphertext: sk },
    ];

    const { error } = await supabase.from('tenant_secrets').upsert(upserts);
    setSaving(false);
    setMsg(error ? `Error: ${error.message}` : 'Saved');
  };

  const disconnectStripe = async () => {
    if (!tenantId) return;
    
    if (!confirm('Are you sure you want to disconnect Stripe? This will remove all Stripe connection data and you\'ll need to reconnect to process payments.')) {
      return;
    }

    setDisconnecting(true);
    setMsg('');

    try {
      const response = await fetch('/api/stripe/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenant_id: tenantId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to disconnect');
      }

      setMsg('Stripe connection disconnected successfully');
      setConnection({ connected: false });
      setPk('');
      setSk('');
    } catch (error) {
      console.error('Disconnect error:', error);
      setMsg(`Error: ${error instanceof Error ? error.message : 'Failed to disconnect'}`);
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return <div className="max-w-2xl p-6">Loading...</div>;
  }

  return (
    <div className="max-w-2xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Stripe Integration</h1>
        <p className="text-gray-600">Manage your Stripe payment connection</p>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connection Status</CardTitle>
        </CardHeader>
        <CardContent>
          {connection?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="font-medium text-green-700">Connected to Stripe</span>
                {connection.mode && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    connection.mode === 'test' 
                      ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' 
                      : 'bg-red-100 text-red-800 border border-red-200'
                  }`}>
                    {connection.mode.toUpperCase()} MODE
                  </span>
                )}
              </div>
              {connection.accountId && (
                <p className="text-sm text-gray-600">
                  Account ID: {connection.accountId}
                </p>
              )}
              <Button 
                variant="destructive" 
                onClick={disconnectStripe}
                disabled={disconnecting}
                className="mt-3"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect Stripe'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                <span className="text-gray-600">Not connected to Stripe</span>
              </div>
              {connection?.error && (
                <Alert>
                  <AlertDescription className="text-red-600">
                    {connection.error}
                  </AlertDescription>
                </Alert>
              )}
              <p className="text-sm text-gray-600">
                Use the Connect with Stripe button in the Payments section to connect your account.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Key Configuration (Legacy) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Manual Key Configuration</CardTitle>
          <p className="text-sm text-gray-600">
            Alternative method for setting Stripe keys manually (legacy)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="publishable-key">Publishable Key</Label>
            <Input
              id="publishable-key"
              value={pk}
              onChange={(e) => setPk(e.target.value)}
              placeholder="pk_live_... or pk_test_..."
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="secret-key">Secret Key</Label>
            <Input
              id="secret-key"
              type="password"
              value={sk}
              onChange={(e) => setSk(e.target.value)}
              placeholder="sk_live_... or sk_test_..."
              className="mt-1"
            />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save Keys'}
          </Button>
        </CardContent>
      </Card>

      {/* Messages */}
      {msg && (
        <Alert className={msg.includes('Error') ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}>
          <AlertDescription className={msg.includes('Error') ? 'text-red-600' : 'text-green-600'}>
            {msg}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
