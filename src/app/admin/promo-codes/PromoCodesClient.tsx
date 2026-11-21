'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useTenant } from '@/hooks/useTenant'
import { Plus, Trash2, Edit2, X, Check, Loader2, Pause, Play } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { describeDiscount, ukDateString } from '@/lib/promo/promoCodes'

type PromoRow = {
  id: string
  code: string
  description: string | null
  discount_type: 'percent' | 'fixed'
  discount_value: number
  valid_from: string | null
  valid_until: string | null
  max_uses: number | null
  min_spend: number | null
  times_used: number
  is_active: boolean
  created_at: string
}

type FormState = {
  code: string
  description: string
  discount_type: 'percent' | 'fixed'
  discount_value: string
  valid_from: string
  valid_until: string
  max_uses: string
  min_spend: string
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  code: '',
  description: '',
  discount_type: 'percent',
  discount_value: '',
  valid_from: '',
  valid_until: '',
  max_uses: '',
  min_spend: '',
  is_active: true,
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function validityText(p: PromoRow): string {
  if (p.valid_from && p.valid_until) return `${fmtDate(p.valid_from)} – ${fmtDate(p.valid_until)}`
  if (p.valid_from) return `From ${fmtDate(p.valid_from)}`
  if (p.valid_until) return `Until ${fmtDate(p.valid_until)}`
  return 'Any time'
}

/** What a customer would see right now, for the status badge. */
function statusOf(p: PromoRow): { label: string; className: string } {
  const today = ukDateString()
  if (!p.is_active) return { label: 'Paused', className: 'bg-gray-100 text-gray-700' }
  if (p.valid_until && today > p.valid_until) return { label: 'Expired', className: 'bg-gray-100 text-gray-700' }
  if (p.max_uses != null && p.times_used >= p.max_uses) return { label: 'Used up', className: 'bg-gray-100 text-gray-700' }
  if (p.valid_from && today < p.valid_from) return { label: 'Scheduled', className: 'bg-blue-100 text-blue-800' }
  return { label: 'Live', className: 'bg-green-100 text-green-800' }
}

export default function PromoCodesClient() {
  const { tenantId, loading: tenantLoading } = useTenant()
  const [codes, setCodes] = useState<PromoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/promo-codes?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.success) setCodes(json.data || [])
      else setError(json.error || 'Failed to load promo codes')
    } catch {
      setError('Failed to load promo codes')
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    void load()
  }, [load])

  function openAdd() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  function openEdit(p: PromoRow) {
    setEditingId(p.id)
    setForm({
      code: p.code,
      description: p.description ?? '',
      discount_type: p.discount_type,
      discount_value: String(p.discount_value),
      valid_from: p.valid_from ?? '',
      valid_until: p.valid_until ?? '',
      max_uses: p.max_uses != null ? String(p.max_uses) : '',
      min_spend: p.min_spend != null ? String(p.min_spend) : '',
      is_active: p.is_active,
    })
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tenantId) return
    setSaving(true)
    try {
      const res = await fetch(editingId ? `/api/admin/promo-codes/${editingId}` : '/api/admin/promo-codes', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, ...form }),
      })
      const json = await res.json()
      if (json.success) {
        toast({ title: editingId ? 'Promo code updated' : 'Promo code created', description: json.data?.code })
        closeForm()
        void load()
      } else {
        toast({ title: 'Could not save', description: json.error || 'Please check the form.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Could not save', description: 'Please try again.', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: PromoRow) {
    if (!tenantId) return
    const res = await fetch(`/api/admin/promo-codes/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, is_active: !p.is_active }),
    })
    const json = await res.json().catch(() => ({}))
    if (json.success) void load()
    else toast({ title: 'Could not update', description: json.error, variant: 'destructive' })
  }

  async function handleDelete(p: PromoRow) {
    if (!tenantId) return
    if (!confirm(`Delete promo code ${p.code}? Customers will no longer be able to use it.`)) return
    const res = await fetch(`/api/admin/promo-codes/${p.id}?tenantId=${encodeURIComponent(tenantId)}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (json.success) {
      toast({ title: 'Promo code deleted', description: p.code })
      void load()
    } else {
      toast({ title: 'Could not delete', description: json.error, variant: 'destructive' })
    }
  }

  if (tenantLoading || (loading && codes.length === 0)) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
          <p className="mt-4 text-gray-600">Loading promo codes…</p>
        </CardContent>
      </Card>
    )
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Promo Codes</h1>
        <p className="text-sm text-gray-500">
          Discount codes customers can type when booking on your website. Each code can be limited to dates, a number
          of uses and a minimum spend.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="shadow-soft">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Codes</CardTitle>
          {!formOpen && (
            <Button onClick={openAdd} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add code
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {formOpen && (
            <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded-lg space-y-4 bg-gray-50/60">
              <p className="text-sm font-medium">{editingId ? `Edit ${form.code}` : 'New promo code'}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="promo-code">Code *</Label>
                  <Input
                    id="promo-code"
                    value={form.code}
                    onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s+/g, ''))}
                    placeholder="e.g. XMAS10"
                    maxLength={32}
                    required
                    className="uppercase font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">Letters, numbers, - or _. Customers can type it in any case.</p>
                </div>
                <div>
                  <Label htmlFor="promo-description">Description</Label>
                  <Input
                    id="promo-description"
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder="e.g. Christmas newsletter"
                    maxLength={200}
                  />
                  <p className="text-xs text-gray-500 mt-1">Only shown here, not to customers.</p>
                </div>

                <div>
                  <Label htmlFor="promo-type">Discount *</Label>
                  <div className="flex gap-2">
                    <select
                      id="promo-type"
                      value={form.discount_type}
                      onChange={(e) => set('discount_type', e.target.value as 'percent' | 'fixed')}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="percent">% off</option>
                      <option value="fixed">£ off</option>
                    </select>
                    <Input
                      id="promo-value"
                      aria-label={form.discount_type === 'percent' ? 'Percentage off' : 'Pounds off'}
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      max={form.discount_type === 'percent' ? '100' : undefined}
                      step="0.01"
                      value={form.discount_value}
                      onChange={(e) => set('discount_value', e.target.value)}
                      placeholder={form.discount_type === 'percent' ? '10' : '5.00'}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="promo-min">Minimum spend (£)</Label>
                  <Input
                    id="promo-min"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={form.min_spend}
                    onChange={(e) => set('min_spend', e.target.value)}
                    placeholder="No minimum"
                  />
                  <p className="text-xs text-gray-500 mt-1">Parking price before the discount.</p>
                </div>

                <div>
                  <Label htmlFor="promo-from">Valid from</Label>
                  <Input id="promo-from" type="date" value={form.valid_from} onChange={(e) => set('valid_from', e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="promo-until">Valid until</Label>
                  <Input id="promo-until" type="date" value={form.valid_until} onChange={(e) => set('valid_until', e.target.value)} />
                  <p className="text-xs text-gray-500 mt-1">The days customers can book with it. Leave blank for no limit.</p>
                </div>

                <div>
                  <Label htmlFor="promo-max">Maximum uses</Label>
                  <Input
                    id="promo-max"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={form.max_uses}
                    onChange={(e) => set('max_uses', e.target.value)}
                    placeholder="Unlimited"
                  />
                  <p className="text-xs text-gray-500 mt-1">Total paid bookings that can use it.</p>
                </div>
                <div className="flex items-center gap-2 md:pt-6">
                  <input
                    type="checkbox"
                    id="promo-active"
                    checked={form.is_active}
                    onChange={(e) => set('is_active', e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="promo-active" className="cursor-pointer">
                    Active (customers can use it)
                  </Label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  {editingId ? 'Save' : 'Create'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={closeForm}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {codes.length === 0 ? (
            !formOpen && (
              <div className="text-center py-8 text-gray-500">
                <p>No promo codes yet.</p>
                <Button onClick={openAdd} size="sm" variant="outline" className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first code
                </Button>
              </div>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b">
                    <th className="py-2 pr-4 font-medium">Code</th>
                    <th className="py-2 pr-4 font-medium">Discount</th>
                    <th className="py-2 pr-4 font-medium">Valid</th>
                    <th className="py-2 pr-4 font-medium">Uses</th>
                    <th className="py-2 pr-4 font-medium">Min spend</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 font-medium sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {codes.map((p) => {
                    const status = statusOf(p)
                    return (
                      <tr key={p.id} className={editingId === p.id ? 'bg-blue-50' : ''}>
                        <td className="py-3 pr-4">
                          <div className="font-mono font-semibold">{p.code}</div>
                          {p.description && <div className="text-xs text-gray-500">{p.description}</div>}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">{describeDiscount(p.discount_type, p.discount_value)}</td>
                        <td className="py-3 pr-4 whitespace-nowrap">{validityText(p)}</td>
                        <td className="py-3 pr-4 whitespace-nowrap tabular-nums">
                          {p.times_used}
                          {p.max_uses != null ? ` / ${p.max_uses}` : ''}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          {p.min_spend != null ? `£${Number(p.min_spend).toFixed(2)}` : '—'}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="py-3 whitespace-nowrap text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void toggleActive(p)}
                              aria-label={p.is_active ? `Pause ${p.code}` : `Resume ${p.code}`}
                              title={p.is_active ? 'Pause' : 'Resume'}
                            >
                              {p.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openEdit(p)} aria-label={`Edit ${p.code}`} title="Edit">
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleDelete(p)}
                              aria-label={`Delete ${p.code}`}
                              title="Delete"
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
