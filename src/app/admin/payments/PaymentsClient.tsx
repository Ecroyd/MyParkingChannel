'use client';

import { useEffect, useState } from 'react';

interface PaymentsClientProps {
  // Add any props you need from the server component
}

export default function PaymentsClient({}: PaymentsClientProps) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
      const res = await fetch('/api/payments/connect/onboard', { method: 'POST' });
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

  return (
    <section className="rounded-xl border p-4">
      <h2 className="font-medium mb-2">Stripe Connection</h2>
      {loading && <div>Loading…</div>}
      {!loading && !status?.connected && (
        <div className="space-y-3">
          <p className="text-sm">You're not connected yet.</p>
          {status?.error && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-sm text-red-800">{status.error}</p>
            </div>
          )}
          <button className="rounded bg-black text-white px-4 py-2" onClick={connectStripe}>
            Connect with Stripe
          </button>
          <button className="ml-2 rounded border px-3 py-2" onClick={refresh}>
            Refresh
          </button>
        </div>
      )}
      {!loading && status?.connected && (
        <div className="space-y-2 text-sm">
          <div>Connected: <b>true</b></div>
          <div>charges_enabled: <b>{String(status.charges_enabled)}</b></div>
          <div>payouts_enabled: <b>{String(status.payouts_enabled)}</b></div>
          <div>details_submitted: <b>{String(status.details_submitted)}</b></div>
          <div className="mt-2">
            <button className="rounded border px-3 py-2" onClick={connectStripe}>
              Update Stripe Details
            </button>
            <button className="ml-2 rounded border px-3 py-2" onClick={refresh}>
              Refresh
            </button>
          </div>
        </div>
      )}
    </section>
  );
}