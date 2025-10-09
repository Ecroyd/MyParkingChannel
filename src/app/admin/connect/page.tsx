// app/admin/connect/page.tsx
'use client';
import { useEffect, useState } from 'react';

export default function ConnectAdmin() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const query = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const qsAccount = query.get('account');
  useEffect(() => {
    if (qsAccount) setAccountId(qsAccount);
  }, [qsAccount]);

  async function createAccount() {
    setLoading(true);
    const res = await fetch('/api/stripe/accounts/create', { method: 'POST' });
    const json = await res.json();
    setAccountId(json.accountId);
    window.location.href = json.onboardingUrl; // send user straight to onboarding
  }

  async function resumeOnboarding() {
    if (!accountId) return;
    const res = await fetch(`/api/stripe/accounts/${accountId}/onboard`, { method: 'POST' });
    const json = await res.json();
    window.location.href = json.onboardingUrl;
  }

  async function refreshStatus() {
    if (!accountId) return;
    const res = await fetch(`/api/stripe/accounts/${accountId}/status`);
    setStatus(await res.json());
  }

  useEffect(() => {
    if (accountId) refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Simple product create for this account (demo form)
  async function createProduct(form: FormData) {
    if (!accountId) return alert('No connected account in context.');
    const name = String(form.get('name') || '');
    const desc = String(form.get('description') || '');
    const price = Number(form.get('price') || 0) * 100;
    const currency = String(form.get('currency') || 'gbp');

    const res = await fetch(`/api/stripe/accounts/${accountId}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: desc, priceInCents: price, currency }),
    });

    if (!res.ok) return alert('Failed to create product.');
    alert('Product created on connected account ✅');
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold mb-4">Stripe Connect – Demo</h1>

      {!accountId && (
        <section className="rounded-xl border p-4 mb-6">
          <h2 className="font-medium mb-2">Step 1: Create + Onboard a Connected Account</h2>
          <p className="text-sm mb-3">
            Click to create a controller-based account and open Stripe onboarding.
          </p>
          <button
            className="rounded bg-black text-white px-4 py-2"
            onClick={createAccount}
            disabled={loading}
          >
            {loading ? 'Creating…' : 'Create & Onboard'}
          </button>
        </section>
      )}

      {accountId && (
        <>
          <section className="rounded-xl border p-4 mb-6">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Connected Account</h2>
              <code className="text-xs">{accountId}</code>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="rounded border px-3 py-2" onClick={refreshStatus}>
                Refresh Status
              </button>
              <button className="rounded border px-3 py-2" onClick={resumeOnboarding}>
                Onboard to Collect Payments
              </button>
              <a
                className="rounded border px-3 py-2"
                href={`/${accountId}/storefront`}
              >
                View Storefront →
              </a>
            </div>
            {status && (
              <div className="mt-4 text-sm">
                <div>charges_enabled: <b>{String(status.charges_enabled)}</b></div>
                <div>payouts_enabled: <b>{String(status.payouts_enabled)}</b></div>
                <div>details_submitted: <b>{String(status.details_submitted)}</b></div>
              </div>
            )}
          </section>

          <section className="rounded-xl border p-4">
            <h2 className="font-medium mb-2">Create a Product (on this connected account)</h2>
            <form
              className="grid gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                await createProduct(new FormData(e.currentTarget));
                e.currentTarget.reset();
              }}
            >
              <input className="border rounded p-2" name="name" placeholder="Name" required />
              <input className="border rounded p-2" name="description" placeholder="Description" />
              <div className="flex gap-2">
                <input className="border rounded p-2 w-1/2" name="price" placeholder="Price (e.g. 9.99)" required />
                <input className="border rounded p-2 w-1/2" name="currency" placeholder="Currency (gbp, usd…)" defaultValue="gbp" />
              </div>
              <button className="rounded bg-black text-white px-4 py-2 w-fit">Create Product</button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
