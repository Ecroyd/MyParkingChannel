'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import EmptyState from '@/components/admin/EmptyState'
import { RadioTower, Plus } from 'lucide-react'

export default function DevicesPage() {
  const [user, setUser] = useState<any>(null)
  const [tenant, setTenant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          setError('Not authenticated')
          setLoading(false)
          return
        }

        setUser(user)

        // Get user's tenants (following the same pattern as other admin pages)
        const { data: userTenants, error: tenantError } = await supabase
          .from('user_tenants')
          .select(`
            tenant_id,
            role,
            is_default,
            tenants (
              id,
              name,
              slug,
              timezone
            )
          `)
          .eq('user_id', user.id)

        if (tenantError) {
          setError('Failed to load tenant data')
          setLoading(false)
          return
        }

        if (!userTenants || userTenants.length === 0) {
          setError('No tenant access found')
          setLoading(false)
          return
        }

        // Find the default tenant or use the first one
        const userTenant = userTenants.find(ut => ut.is_default) || userTenants[0]
        setTenant(userTenant?.tenants)
        setLoading(false)
      } catch (err) {
        console.error('Load data error:', err)
        setError('Failed to load data')
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-red-600">{error}</p>
            <Button onClick={() => router.push('/admin/setup')} className="w-full">
              Go to Setup
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!tenant) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-gray-600">Tenant Required</p>
            <p className="text-sm text-gray-500">Please specify a tenant to access the admin dashboard.</p>
            <Button onClick={() => router.push('/admin/setup')} className="w-full">
              Go to Setup
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // TODO: fetch gate_devices for tenant
  const devices: any[] = []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Devices</h1>
          <p className="text-sm text-gray-500">Manage ANPR cameras, QR scanners, and tablets.</p>
        </div>
        <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Add device</Button>
      </div>

      {devices.length === 0 ? (
        <Card className="shadow-soft">
          <CardContent>
            <EmptyState title="No devices yet." detail="Connect your first device and we'll generate an API key hash." action={<Button size="sm">Add device</Button>} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map(d => (
            <Card key={d.id} className="shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><RadioTower className="h-4 w-4" /> {d.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xs text-gray-500">Kind: {d.kind}</div>
                <div className="text-xs text-gray-500">Last seen: {d.last_seen ?? '—'}</div>
                <Badge variant={d.status === 'active' ? 'default' : 'secondary'}>{d.status}</Badge>
                <div className="pt-2">
                  <Button size="sm" variant="outline">Rotate key</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

