// app/admin/payments/page.tsx
'use client';

import { useEffect, useState } from 'react';

export default function PaymentsAdmin() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const s = await fetch('/api/payments/connect/status').then(r => r.json());
    setStatus(s);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function connectStripe() {
    const res = await fetch('/api/payments/connect/onboard', { method: 'POST' });
    const json = await res.json();
    if (json.url) window.location.href = json.url;
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold mb-4">Payments</h1>

      <section className="rounded-xl border p-4">
        <h2 className="font-medium mb-2">Stripe Connection</h2>
        {loading && <div>Loading…</div>}
        {!loading && !status?.connected && (
          <div className="space-y-3">
            <p className="text-sm">You're not connected yet.</p>
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
    </main>
  );
}