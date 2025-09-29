'use client'
import { useState } from 'react'

export default function SwTools() {
  if (process.env.NEXT_PUBLIC_DEBUG_SITE !== '1') return null;
  const [busy, setBusy] = useState(false);

  const nuke = async () => {
    setBusy(true);
    try {
      await fetch('/api/debug/clear', { cache: 'no-store' });
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        regs.forEach(r => r.unregister());
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } finally {
      location.reload();
    }
  };

  const update = async () => {
    setBusy(true);
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.update()));
      }
    } finally {
      location.reload();
    }
  };

  return (
    <div style={{ position:'fixed', right:8, bottom:8, zIndex:99999 }}>
      <button onClick={update} disabled={busy}
        className="rounded-md border px-3 py-1 mr-2 bg-white/80">
        SW Update
      </button>
      <button onClick={nuke} disabled={busy}
        className="rounded-md border px-3 py-1 bg-white/80">
        SW Nuke
      </button>
    </div>
  );
}
