'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  CreditCard, 
  ExternalLink, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  DollarSign,
  Settings,
  Info
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

interface StripeConnection {
  tenant_id: string;
  stripe_account_id: string;
  stripe_publishable_key: string;
  connected: boolean;
  created_at: string;
  updated_at: string;
}

interface PaymentsClientProps {
  tenant: Tenant;
  stripeConnection: StripeConnection | null;
}

export default function PaymentsClient({ tenant, stripeConnection }: PaymentsClientProps) {
  const [loading, setLoading] = useState(false);
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [mode, setMode] = useState<'test' | 'live'>('test'); // Default to test mode
  const { toast } = useToast();

  useEffect(() => {
    if (stripeConnection?.connected) {
      fetchAccountInfo();
    }
  }, [stripeConnection]);

  const fetchAccountInfo = async () => {
    try {
      const response = await fetch(`/api/stripe/account-info?tenant_id=${tenant.id}`);
      if (response.ok) {
        const data = await response.json();
        setAccountInfo(data);
      }
    } catch (error) {
      console.error('Failed to fetch account info:', error);
    }
  };

  const handleConnect = () => {
    setLoading(true);
    const modeParam = mode === 'test' ? '&mode=test' : '&mode=live';
    window.location.href = `/api/stripe/connect?tenant_id=${tenant.id}${modeParam}`;
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Stripe account? This will disable payment processing.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/stripe/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenant.id }),
      });

      if (response.ok) {
        toast({
          title: 'Stripe account disconnected',
          description: 'Your Stripe account has been successfully disconnected.',
        });
        window.location.reload();
      } else {
        throw new Error('Failed to disconnect');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to disconnect Stripe account. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Payment Settings</h1>
        <p className="text-gray-600 mt-2">
          Manage your Stripe account for payment processing and payouts.
        </p>
      </div>

      {/* Mode Toggle */}
      <Card className={mode === 'test' ? 'bg-orange-50 border-orange-200' : ''}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Payment Mode</h3>
              <p className="text-sm text-gray-600">
                {mode === 'live' 
                  ? 'Live payments - real money transactions' 
                  : 'Test mode - safe sandbox environment'
                }
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm ${mode === 'test' ? 'text-orange-700 font-medium' : 'text-gray-600'}`}>Test</span>
              <Switch
                checked={mode === 'live'}
                onCheckedChange={(checked) => {
                  setMode(checked ? 'live' : 'test');
                }}
              />
              <span className={`text-sm ${mode === 'live' ? 'text-green-700 font-medium' : 'text-gray-600'}`}>Live</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Stripe Account Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stripeConnection?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-medium">Connected</span>
                <Badge variant="secondary">Active</Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Account ID</label>
                  <p className="text-sm font-mono bg-gray-100 p-2 rounded">
                    {stripeConnection.stripe_account_id}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Connected</label>
                  <p className="text-sm">
                    {new Date(stripeConnection.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {accountInfo && (
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-2">Account Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Business Name</label>
                      <p className="text-sm">{accountInfo.business_profile?.name || 'Not set'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Country</label>
                      <p className="text-sm">{accountInfo.country?.toUpperCase() || 'Not set'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Charges Enabled</label>
                      <p className="text-sm">
                        {accountInfo.charges_enabled ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-red-100 text-red-800">
                            No
                          </Badge>
                        )}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Payouts Enabled</label>
                      <p className="text-sm">
                        {accountInfo.payouts_enabled ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-red-100 text-red-800">
                            No
                          </Badge>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => window.open('https://dashboard.stripe.com', '_blank')}
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Stripe Dashboard
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Disconnecting...
                    </>
                  ) : (
                    'Disconnect Account'
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Stripe Account Connected</h3>
              <p className="text-gray-600 mb-6">
                Connect your Stripe account to start processing payments and receiving payouts.
              </p>
              <Button
                onClick={handleConnect}
                disabled={loading}
                className="flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" />
                    Connect Stripe Account
                  </>
                )}
              </Button>
              
              {/* Privacy Note */}
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start justify-between">
                  <p className="text-sm text-blue-800">
                    <strong>Privacy & Security:</strong> Stripe securely handles all payment data. 
                    My Parking Channel only receives permission to process bookings and payouts on your behalf; 
                    we can't withdraw or access your Stripe balance.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowInfoModal(true)}
                    className="ml-2 p-1 h-auto text-blue-600 hover:text-blue-800"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Settings */}
      {stripeConnection?.connected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Payment Settings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">Webhook Configuration</h4>
                  <p className="text-sm text-gray-600">
                    Configure webhooks to receive payment notifications
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Configure
                </Button>
              </div>
              
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">Payout Settings</h4>
                  <p className="text-sm text-gray-600">
                    Manage your payout schedule and bank account
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.open('https://dashboard.stripe.com/settings/payouts', '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Manage
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Why We Need Stripe Access</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowInfoModal(false)}
                className="p-1"
              >
                ×
              </Button>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                <strong>Payment Processing:</strong> We need to create charges for parking bookings and process payments directly to your Stripe account.
              </p>
              <p>
                <strong>Refunds:</strong> We can process refunds through our admin interface when customers cancel bookings or request refunds.
              </p>
              <p>
                <strong>Payouts:</strong> We can view your payout history and status to help you track your earnings.
              </p>
              <p>
                <strong>Security:</strong> We never store your payment data - Stripe handles all sensitive information securely. We can't withdraw money from your account or access your bank details.
              </p>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setShowInfoModal(false)}>
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
