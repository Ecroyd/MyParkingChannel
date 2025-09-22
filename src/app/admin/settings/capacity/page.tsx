'use client'
import { useEffect, useState } from 'react'
import { addDays, format, eachDayOfInterval, parseISO } from 'date-fns'
import { useTenant } from '@/hooks/useTenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2, Save, Calendar } from 'lucide-react'
import { toast } from 'sonner'

type OverrideRow = { date: string; capacity: number }

export default function CapacitySettingsPage() {
  const { tenantId, tenantSlug, loading } = useTenant()

  const [defaultCap, setDefaultCap] = useState<number | ''>('')
  const [overrides, setOverrides] = useState<OverrideRow[]>([])
  const [rangeFrom, setRangeFrom] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [rangeTo, setRangeTo] = useState<string>(format(addDays(new Date(), 30), 'yyyy-MM-dd'))
  const [status, setStatus] = useState<string>('')

  useEffect(() => {
    if (loading || !tenantId) return
    ;(async () => {
      setStatus('Loading…')
      const qs = new URLSearchParams({ tenant_id: tenantId, from: rangeFrom, to: rangeTo })
      const [r1, r2] = await Promise.all([
        fetch(`/api/settings/capacity/default?tenant_id=${tenantId}`),
        fetch(`/api/settings/capacity/overrides?${qs}`)
      ])
      const j1 = await r1.json(); const j2 = await r2.json()
      setDefaultCap(j1.default_capacity ?? '')
      setOverrides(j2.rows ?? [])
      setStatus('')
    })()
  }, [tenantId, loading, rangeFrom, rangeTo])

  function setOverride(date: string, capacity: number) {
    setOverrides(prev => {
      const idx = prev.findIndex(r => r.date === date)
      if (idx >= 0) {
        const copy = [...prev]; copy[idx] = { date, capacity }; return copy
      }
      return [...prev, { date, capacity }].sort((a,b)=>a.date.localeCompare(b.date))
    })
  }

  async function saveDefault() {
    if (!tenantId || defaultCap === '') return
    setStatus('Saving default…')
    const r = await fetch('/api/settings/capacity/default', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, default_capacity: Number(defaultCap) })
    })
    const j = await r.json()
    if (r.ok) {
      setStatus('Default saved.')
      toast.success('Default capacity saved successfully')
    } else {
      setStatus(`Error: ${j.error ?? 'unknown'}`)
      toast.error(`Failed to save default capacity: ${j.error}`)
    }
  }

  async function saveOverrides() {
    setStatus('Saving overrides…')
    const rows = overrides.filter(r => r.capacity != null && !Number.isNaN(r.capacity))
    const r = await fetch('/api/settings/capacity/overrides', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: tenantId, rows })
    })
    const j = await r.json()
    if (r.ok) {
      setStatus(`Saved ${rows.length} day(s).`)
      toast.success(`Saved ${rows.length} capacity overrides`)
    } else {
      setStatus(`Error: ${j.error ?? 'unknown'}`)
      toast.error(`Failed to save overrides: ${j.error}`)
    }
  }

  function fillRange(cap: number) {
    const days = eachDayOfInterval({ start: parseISO(rangeFrom), end: parseISO(rangeTo) })
    const rows = days.map(d => ({ date: format(d, 'yyyy-MM-dd'), capacity: cap }))
    setOverrides(rows)
    toast.success(`Filled ${rows.length} days with capacity ${cap}`)
  }

  async function deleteOverride(date: string) {
    const r = await fetch(`/api/settings/capacity/overrides?${new URLSearchParams({ tenant_id: tenantId, date })}`, { method: 'DELETE' })
    if (r.ok) {
      setOverrides(prev => prev.filter(x => x.date !== date))
      toast.success('Override deleted')
    } else {
      toast.error('Failed to delete override')
    }
  }

  if (loading) return <div className="p-6">Finding tenant…</div>
  if (!tenantId) return <div className="p-6 text-red-600">No tenant resolved. Open from a tenant domain, set a tenant cookie, or add ?tenant=&lt;slug&gt; to the URL.</div>

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3">
        <Calendar className="h-6 w-6 text-brand-600" />
        <h1 className="text-2xl font-semibold">Capacity Settings</h1>
      </div>

      <div className="rounded-xl bg-blue-50 border p-3 text-sm">
        <div><span className="font-medium">Tenant:</span> {tenantSlug ?? tenantId}</div>
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-lg">Default Capacity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Default capacity
              </label>
              <Input
                type="number" 
                min={0} 
                placeholder="100"
                value={defaultCap}
                onChange={e => setDefaultCap(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
            <div className="flex items-end">
              <Button 
                onClick={saveDefault}
                disabled={defaultCap === ''}
                className="w-full"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Default
              </Button>
            </div>
            <div className="flex items-center">
              {status && <Badge variant="outline" className="text-xs">{status}</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-lg">Per-day Overrides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                From
              </label>
              <Input
                type="date"
                value={rangeFrom} 
                onChange={e => setRangeFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                To
              </label>
              <Input
                type="date"
                value={rangeTo} 
                onChange={e => setRangeTo(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Fill range with
              </label>
              <Input
                id="fillCap" 
                type="number" 
                min={0} 
                placeholder="150"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  const el = document.getElementById('fillCap') as HTMLInputElement | null
                  const cap = el?.value ? Number(el.value) : NaN
                  if (!Number.isNaN(cap)) fillRange(cap)
                }}
                className="w-full"
              >
                Fill Range
              </Button>
            </div>
          </div>

          <div className="border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Capacity</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {overrides.map((r, i) => (
                    <tr key={r.date} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{format(parseISO(r.date), 'MMM d, yyyy')}</td>
                      <td className="px-4 py-3">
                        <Input
                          type="number" 
                          min={0}
                          className="w-24"
                          value={r.capacity}
                          onChange={e => setOverride(r.date, Number(e.target.value))}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteOverride(r.date)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {overrides.length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={3}>
                        No overrides in this range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <Button 
              onClick={saveOverrides} 
            >
              <Save className="h-4 w-4 mr-2" />
              Save Overrides
            </Button>
            {status && <Badge variant="outline" className="text-xs">{status}</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-soft bg-blue-50/50">
        <CardContent className="p-4">
          <h3 className="font-medium text-slate-900 mb-2">💡 How this works</h3>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>• <strong>Default capacity</strong> is used when no specific override exists for a date</li>
            <li>• <strong>Per-day overrides</strong> take precedence over the default for specific dates</li>
            <li>• Your <strong>Daily Occupancy chart</strong> will automatically reflect these settings</li>
            <li>• Capacity is used to calculate the percentage bars in the analytics view</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

