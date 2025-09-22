'use client'
import { useMemo, useState } from 'react'

type Basis = 'arrival' | 'departure' | 'stay_overlap'
type Granularity = 'summary' | 'daily'

export default function ExportChannelRevenue({
  tenantId, from, to
}: { tenantId: string; from: string; to: string }) {
  const [basis, setBasis] = useState<Basis>('departure')
  const [granularity, setGranularity] = useState<Granularity>('summary')
  const [statusesText, setStatusesText] = useState('') // e.g. confirmed,completed

  const href = useMemo(() => {
    const qs = new URLSearchParams({
      tenant_id: tenantId,
      from, to,
      basis,
      granularity,
    })
    const s = statusesText.split(',').map(x=>x.trim()).filter(Boolean)
    if (s.length) qs.set('statuses', s.join(','))
    return `/api/analytics/export/channel-revenue?${qs.toString()}`
  }, [tenantId, from, to, basis, granularity, statusesText])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm">
        Basis:{' '}
        <select className="border rounded-lg px-2 py-1" value={basis} onChange={e=>setBasis(e.target.value as Basis)}>
          <option value="departure">Departure</option>
          <option value="arrival">Arrival</option>
          <option value="stay_overlap">Stay overlap</option>
        </select>
      </label>

      <label className="text-sm">
        Granularity:{' '}
        <select className="border rounded-lg px-2 py-1" value={granularity} onChange={e=>setGranularity(e.target.value as Granularity)}>
          <option value="summary">Summary</option>
          <option value="daily">Daily</option>
        </select>
      </label>

      <input
        className="border rounded-lg px-2 py-1 text-sm"
        placeholder="statuses (optional): confirmed,completed"
        value={statusesText}
        onChange={e=>setStatusesText(e.target.value)}
      />

      <a href={href} className="rounded-2xl bg-black text-white px-4 py-2">
        Download CSV
      </a>
    </div>
  )
}
