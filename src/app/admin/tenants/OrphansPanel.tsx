'use client';
import { useEffect, useState } from 'react';

export default function OrphansPanel() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/tenants/orphans');
      const out = await res.json();
      setRows(out.tenants ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ load(); }, []);

  if (!rows.length) {
    return (
      <div className="rounded-xl border p-4">
        <div className="font-medium">Orphan Tenants</div>
        <div className="text-sm text-gray-600 mt-1">No orphan tenants found.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="font-medium">Orphan Tenants</div>
      <div className="text-sm text-gray-600 mt-1">Assign an owner or delete to free the slug.</div>

      <div className="mt-4 flex items-center gap-2">
        <input className="border rounded-lg px-3 py-2" placeholder="Owner email…" value={email} onChange={e=>setEmail(e.target.value)} />
        <button className="px-3 py-2 rounded-lg border" onClick={load} disabled={loading}>Refresh</button>
      </div>

      <div className="mt-4 grid gap-2">
        {rows.map((r)=>(
          <div key={r.id} className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <div className="font-medium">{r.slug}</div>
              <div className="text-sm text-gray-600">{r.name}</div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-2 rounded-lg border"
                onClick={async ()=>{
                  if (!email) return alert('Enter an owner email first');
                  const res = await fetch('/api/admin/tenants/orphans/adopt', {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ tenantId: r.id, ownerEmail: email })
                  });
                  const out = await res.json();
                  if (!res.ok) return alert(out?.error?.message || 'Failed');
                  alert('Owner assigned');
                  window.location.reload();
                }}>
                Assign owner
              </button>
              <button className="px-3 py-2 rounded-lg border text-red-600"
                onClick={async ()=>{
                  if (!confirm(`Delete tenant "${r.slug}"? This cannot be undone.`)) return;
                  const res = await fetch('/api/admin/tenants/orphans/delete', {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ slug: r.slug })
                  });
                  const out = await res.json();
                  if (!res.ok) return alert(out?.error?.message || 'Failed');
                  alert('Deleted');
                  load();
                }}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
