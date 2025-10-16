'use client';

import { useEffect, useState } from 'react';

interface PaymentsClientProps {
  // Add any props you need from the server component
}

export default function PaymentsClient({}: PaymentsClientProps) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [stripeMode, setStripeMode] = useState<'test' | 'live'>('test');

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/payments/connect/status');
      if (!response.ok) {
        console.error('API Error:', response.status, response.statusText);
        setStatus({ connected: false, error: `API Error: ${response.status}` });
        setLoading(false);
        return;
      }
      const s = await response.json();
      setStatus(s);
    } catch (error) {
      console.error('Fetch error:', error);
      setStatus({ connected: false, error: 'Failed to fetch status' });
    }
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function connectStripe() {
    try {
      const res = await fetch('/api/payments/connect/onboard', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: stripeMode })
      });
      if (!res.ok) {
        console.error('Onboard API Error:', res.status, res.statusText);
        alert(`Failed to create Stripe account: ${res.status}`);
        return;
      }
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        alert('No onboarding URL received');
      }
    } catch (error) {
      console.error('Connect error:', error);
      alert('Failed to connect to Stripe');
    }
  }

  async function disconnectStripe() {
    if (!confirm('Are you sure you want to disconnect Stripe? This will remove all Stripe connection data and you\'ll need to reconnect to process payments.')) {
      return;
    }

    setDisconnecting(true);
    try {
      // Get tenant ID first
      const response = await fetch('/api/admin/tenant/current');
      if (!response.ok) {
        throw new Error('Failed to get tenant ID');
      }
      const { tenant_id } = await response.json();

      const res = await fetch('/api/stripe/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenant_id }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to disconnect');
      }

      alert('Stripe connection disconnected successfully');
      await refresh(); // Refresh the status
    } catch (error) {
      console.error('Disconnect error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Failed to disconnect'}`);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <section className="rounded-xl border p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-medium">Stripe Connection</h2>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-600">Mode:</label>
          <select 
            value={stripeMode} 
            onChange={(e) => setStripeMode(e.target.value as 'test' | 'live')}
            className="text-sm border rounded px-2 py-1"
          >
            <option value="test">Test</option>
            <option value="live">Live</option>
          </select>
        </div>
      </div>
      {loading && <div>Loading…</div>}
      {!loading && !status?.connected && (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <p className="text-sm">You're not connected yet.</p>
            <span className={`text-xs px-2 py-1 rounded ${
              stripeMode === 'test' 
                ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' 
                : 'bg-red-100 text-red-800 border border-red-200'
            }`}>
              {stripeMode === 'test' ? 'TEST MODE' : 'LIVE MODE'}
            </span>
          </div>
          {status?.error && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-sm text-red-800">{status.error}</p>
            </div>
          )}
          <button className="rounded bg-black text-white px-4 py-2" onClick={connectStripe}>
            Connect with Stripe ({stripeMode === 'test' ? 'Test' : 'Live'})
          </button>
          <button className="ml-2 rounded border px-3 py-2" onClick={refresh}>
            Refresh
          </button>
        </div>
      )}
      {!loading && status?.connected && (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="font-medium text-green-700">Connected to Stripe</span>
            <span className={`text-xs px-2 py-1 rounded ${
              stripeMode === 'test' 
                ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' 
                : 'bg-red-100 text-red-800 border border-red-200'
            }`}>
              {stripeMode === 'test' ? 'TEST MODE' : 'LIVE MODE'}
            </span>
          </div>
          <div className="space-y-1 text-sm text-gray-600">
            <div>Account ID: <b>{status.accountId}</b></div>
            <div>Charges enabled: <b>{String(status.charges_enabled)}</b></div>
            <div>Payouts enabled: <b>{String(status.payouts_enabled)}</b></div>
            <div>Details submitted: <b>{String(status.details_submitted)}</b></div>
          </div>
          <div className="flex space-x-2">
            <button className="rounded border px-3 py-2" onClick={connectStripe}>
              Update Stripe Details
            </button>
            <button className="rounded border px-3 py-2" onClick={refresh}>
              Refresh
            </button>
            <button 
              className="rounded bg-red-600 text-white px-3 py-2 hover:bg-red-700"
              onClick={disconnectStripe}
              disabled={disconnecting}
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}