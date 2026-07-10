'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function BookingWidgetInline({ tenantId }: { tenantId: string }) {
  const [form, setForm] = useState({
    name: '', email: '', plate: '',
    start: '', end: '',
    flight_no: '',
  })
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true); setOk(null)
    try {
      const res = await fetch('/api/public/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          customer_name: form.name,
          customer_email: form.email,
          plate: form.plate,
          flight_number: form.flight_no,
          start_at: new Date(form.start).toISOString(),
          end_at: new Date(form.end).toISOString(),
          source: 'direct',
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed')
      setOk('Booking received! Check your email for confirmation.')
      setForm({ name:'', email:'', plate:'', start:'', end:'', flight_no:'' })
    } catch(e:any) { alert(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="panel-title mb-4">Book Parking</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className="input" placeholder="Full name" value={form.name} onChange={e=>setForm(s=>({...s, name:e.target.value}))} />
        <input className="input" placeholder="Email" value={form.email} onChange={e=>setForm(s=>({...s, email:e.target.value}))} />
        <input className="input" placeholder="Car registration" value={form.plate} onChange={e=>setForm(s=>({...s, plate:e.target.value}))} />
        <input className="input" placeholder="Flight number (optional)" value={form.flight_no} onChange={e=>setForm(s=>({...s, flight_no:e.target.value}))} />
        <label className="text-xs font-medium text-fg/70">Arrive<input type="datetime-local" className="input mt-1" value={form.start} onChange={e=>setForm(s=>({...s, start:e.target.value}))}/></label>
        <label className="text-xs font-medium text-fg/70">Depart<input type="datetime-local" className="input mt-1" value={form.end} onChange={e=>setForm(s=>({...s, end:e.target.value}))}/></label>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-fg/60">{ok}</div>
        <Button variant="primary" onClick={submit} disabled={busy}>Book now</Button>
      </div>
    </div>
  )
}

