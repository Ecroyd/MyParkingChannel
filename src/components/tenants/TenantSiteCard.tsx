'use client'
import { useState } from 'react'
import { siteUrlForTenantSlug } from '@/lib/sites/domain'
import { Button } from '@/components/ui/button'

export default function TenantSiteCard({ tenant }: { tenant: { id: string; slug: string; } }) {
  const [busy, setBusy] = useState(false)
  const url = siteUrlForTenantSlug(tenant.slug)

  const ensure = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/sites/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenant.id, template: 'default' }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed to create site')
      window.open(j.url || url, '_blank')
    } catch (e: any) {
      alert(e.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="panel-title mb-2">{tenant.slug} site</div>
      <div className="text-sm text-fg/70 mb-4">{url}</div>
      <div className="flex gap-2">
        <Button onClick={ensure} disabled={busy}>
          {busy ? 'Working…' : 'Create / Ensure Site'}
        </Button>
        <Button variant="default" asChild>
          <a href={url} target="_blank" rel="noreferrer">View Site</a>
        </Button>
      </div>
    </div>
  )
}

