'use client';
import { useState } from 'react';

interface AssignOwnerModalProps {
  tenantId: string;
  currentOwnerEmail: string | null;
}

export default function AssignOwnerModal({ tenantId, currentOwnerEmail }: AssignOwnerModalProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [invite, setInvite] = useState(true);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <button 
        className="text-xs px-2 py-1 rounded border"
        onClick={() => setOpen(true)}
      >
        {currentOwnerEmail ? 'Change Owner' : 'Assign Owner'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="text-lg font-semibold">
              {currentOwnerEmail ? 'Change Owner' : 'Assign Owner'}
            </div>
            <div className="mt-4 grid gap-3">
              {currentOwnerEmail && (
                <div className="text-sm text-gray-600">
                  Current owner: {currentOwnerEmail}
                </div>
              )}
              <label className="grid gap-1">
                <span className="text-sm">New owner email</span>
                <input 
                  className="border rounded-lg px-3 py-2" 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@example.com"
                />
              </label>
              <label className="inline-flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={invite} 
                  onChange={(e) => setInvite(e.target.checked)} 
                />
                <span className="text-sm">Send invite email</span>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button 
                className="px-4 py-2 rounded-lg border" 
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-black text-white disabled:opacity-50"
                disabled={loading || !email}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const res = await fetch('/api/admin/tenants/assign-owner', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        tenantId,
                        ownerEmail: email,
                        invite,
                      }),
                    });
                    const out = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(out?.error?.message || `Failed (${res.status})`);
                    setOpen(false);
                    window.location.reload();
                  } catch (e: any) {
                    alert(e.message || 'Failed to assign owner');
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {loading ? 'Assigning…' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
