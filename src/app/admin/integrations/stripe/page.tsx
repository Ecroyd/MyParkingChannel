'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export default function StripeIntegrationPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [tenantId, setTenantId] = useState<string>('');
  const [pk, setPk] = useState('');
  const [sk, setSk] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    // You likely have the active tenant context elsewhere; adapt as needed
    // For now try to fetch default from a view (v_tenant_owner) or user_tenants
    (async () => {
      const { data } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('is_default', true)
        .limit(1)
        .maybeSingle();
      if (data?.tenant_id) setTenantId(data.tenant_id);
      if (data?.tenant_id) {
        const { data: secrets } = await supabase
          .from('tenant_secrets')
          .select('key, value_ciphertext')
          .eq('tenant_id', data.tenant_id);

        secrets?.forEach(s => {
          if (s.key === 'stripe.publishable_key') setPk(s.value_ciphertext);
          if (s.key === 'stripe.secret_key') setSk(s.value_ciphertext);
        });
      }
    })();
  }, []);

  const save = async () => {
    if (!tenantId) return;
    setSaving(true);
    setMsg('');

    const upserts = [
      { tenant_id: tenantId, key: 'stripe.publishable_key', scope: 'payments', value_ciphertext: pk },
      { tenant_id: tenantId, key: 'stripe.secret_key',      scope: 'payments', value_ciphertext: sk },
    ];

    const { error } = await supabase.from('tenant_secrets').upsert(upserts);
    setSaving(false);
    setMsg(error ? `Error: ${error.message}` : 'Saved');
  };

  return (
    <div className="max-w-xl p-6">
      <h1 className="text-xl font-semibold mb-4">Stripe (per tenant)</h1>

      <label className="block text-sm mb-1">Publishable key</label>
      <input className="w-full border rounded p-2 mb-3" value={pk} onChange={e=>setPk(e.target.value)} placeholder="pk_live_..." />

      <label className="block text-sm mb-1">Secret key</label>
      <input className="w-full border rounded p-2 mb-3" value={sk} onChange={e=>setSk(e.target.value)} placeholder="sk_live_..." />

      <button onClick={save} disabled={saving} className="px-4 py-2 rounded bg-black text-white">
        {saving ? 'Saving...' : 'Save'}
      </button>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </div>
  );
}
