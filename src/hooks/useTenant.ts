'use client'
import { useEffect, useState } from 'react'

type TenantMe = { tenant_id: string | null; slug: string | null; source: string }

export function useTenant() {
  const [data, setData] = useState<TenantMe | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch('/api/tenant/me', { cache: 'no-store' })
        const j = (await r.json()) as TenantMe
        if (alive) setData(j)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  return { tenantId: data?.tenant_id ?? null, tenantSlug: data?.slug ?? null, source: data?.source ?? 'unknown', loading }
}

