'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import EmptyState from '@/components/admin/EmptyState'
import { PlugZap } from 'lucide-react'

export default function IntegrationsPage() {
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

        // Get user's tenant
        const { data: userTenant, error: tenantError } = await supabase
          .from('user_tenants')
          .select(`
            tenant_id,
            role,
            tenants (
              id,
              name,
              slug,
              timezone
            )
          `)
          .eq('user_id', user.id)
          .single()

        if (tenantError) {
          setError('Failed to load tenant data')
          setLoading(false)
          return
        }

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

  // TODO: fetch tenant channel_accounts + secrets (redacted)
  const [stripeConfig, setStripeConfig] = useState({
    publishableKey: '',
    secretKey: ''
  })
  const [stripeLoading, setStripeLoading] = useState(false)

  // Load existing Stripe config
  useEffect(() => {
    if (tenant?.id) {
      loadStripeConfig()
    }
  }, [tenant?.id])

  const loadStripeConfig = async () => {
    try {
      const res = await fetch(`/api/tenant/secrets?tenantId=${tenant.id}`)
      const data = await res.json()
      if (data.ok) {
        setStripeConfig({
          publishableKey: data.publishableKey || '',
          secretKey: '' // Never load secret key to client
        })
      }
    } catch (e) {
      console.error('Failed to load Stripe config:', e)
    }
  }

  const saveStripeConfig = async () => {
    if (!tenant?.id) return
    setStripeLoading(true)
    try {
      const res = await fetch('/api/tenant/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant.id,
          stripePublishableKey: stripeConfig.publishableKey,
          stripeSecretKey: stripeConfig.secretKey
        })
      })
      const data = await res.json()
      if (data.ok) {
        alert('Stripe configuration saved!')
        setStripeConfig(prev => ({ ...prev, secretKey: '' })) // Clear secret key
      } else {
        alert('Failed to save: ' + data.error)
      }
    } catch (e) {
      alert('Failed to save Stripe configuration')
    } finally {
      setStripeLoading(false)
    }
  }

  const accounts: any[] = []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Integrations</h1>
          <p className="text-sm text-gray-500">Connect ParkVia, Holiday Extras and more.</p>
        </div>
        <Button size="sm"><PlugZap className="h-4 w-4 mr-2" /> Add Integration</Button>
      </div>

      {/* Stripe Configuration */}
      <Card className="shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <PlugZap className="h-4 w-4" />
            Stripe Payment Processing
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Publishable Key</Label>
            <Input 
              placeholder="pk_test_..." 
              value={stripeConfig.publishableKey}
              onChange={e => setStripeConfig(prev => ({ ...prev, publishableKey: e.target.value }))}
            />
          </div>
          <div>
            <Label>Secret Key</Label>
            <Input 
              type="password"
              placeholder="sk_test_..." 
              value={stripeConfig.secretKey}
              onChange={e => setStripeConfig(prev => ({ ...prev, secretKey: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <Button 
              onClick={saveStripeConfig}
              disabled={stripeLoading}
            >
              {stripeLoading ? 'Saving...' : 'Save Stripe Keys'}
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              Required for booking extensions and payments. Keys are stored securely per tenant.
            </p>
          </div>
        </CardContent>
      </Card>

      {accounts.length === 0 ? (
        <Card className="shadow-soft">
          <CardContent>
            <EmptyState title="No integrations yet." detail="Add a channel and enter credentials. We store them encrypted per tenant." action={<Button size="sm">Add Integration</Button>} />
          </CardContent>
        </Card>
      ) : accounts.map(acc => (
        <Card key={acc.id} className="shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{acc.display_name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>API Key</Label>
              <Input placeholder="••••••••••" />
            </div>
            <div>
              <Label>Secret</Label>
              <Input placeholder="••••••••••" />
            </div>
            <div className="md:col-span-2">
              <Button>Save</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

