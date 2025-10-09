// app/[accountId]/storefront/page.tsx
'use client';

import { useEffect, useState } from 'react';

type Product = {
  id: string;
  name: string;
  description?: string | null;
  default_price?: string | null;
};

export default function Storefront({ params }: { params: Promise<{ accountId: string }> }) {
  const [accountId, setAccountId] = useState<string>('');

  useEffect(() => {
    params.then(({ accountId }) => setAccountId(accountId));
  }, [params]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId) return;
    
    (async () => {
      const res = await fetch(`/api/stripe/accounts/${accountId}/products`);
      const json = await res.json();
      setProducts(json.products || []);
      setLoading(false);
    })();
  }, [accountId]);

  async function checkout(p: Product) {
    if (!accountId) return;
    
    // For demo, we build price_data on the server (direct charge) instead of reusing default_price
    const res = await fetch(`/api/stripe/accounts/${accountId}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceData: { currency: 'gbp', unit_amount: 799, product_name: p.name },
        quantity: 1,
        applicationFeeAmount: 123,
      }),
    });
    const { url, id, error } = await res.json();
    if (error) return alert(error);
    window.location.href = url;
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold mb-4">Storefront</h1>
      <p className="text-sm mb-6">
        Connected account: <code>{accountId}</code> (demo only — use a tenant slug in production)
      </p>

      {loading && <div>Loading products…</div>}
      {!loading && products.length === 0 && <div>No products yet.</div>}

      <ul className="grid gap-3">
        {products.map((p) => (
          <li key={p.id} className="border rounded p-4">
            <div className="font-medium">{p.name}</div>
            {p.description && <div className="text-sm text-neutral-600">{p.description}</div>}
            <button className="mt-3 rounded bg-black text-white px-3 py-2" onClick={() => checkout(p)}>
              Buy with Checkout
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
