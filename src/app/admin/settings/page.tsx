'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export default function SettingsPage() {
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
              timezone,
              brand_logo_url
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

  // TODO: load tenant + domains + members for current tenant
  const domains: any[] = [{ domain: `${tenant.slug}.localhost:3002`, is_primary: true }]
  const members: any[] = [{ email: user?.email, role: 'owner' }]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-gray-500">Manage your business profile, domains and team.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="billing" disabled>Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="pt-4">
          {/* Business Profile */}
          <Card className="shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Business Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Name</Label>
                <Input defaultValue={tenant.name} />
              </div>
              <div>
                <Label>Slug</Label>
                <Input defaultValue={tenant.slug} />
              </div>
              <div>
                <Label>Timezone</Label>
                <Input defaultValue={tenant.timezone} />
              </div>
              <div className="md:col-span-3">
                <Button>Save changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="domains" className="pt-4">
          <Card className="shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Domains</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {domains.map((d, i) => (
                <div key={i} className="flex items-center justify-between border rounded-xl p-3">
                  <div className="text-sm">{d.domain}</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={d.is_primary}>Set primary</Button>
                    <Button size="sm" variant="outline">Remove</Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Input placeholder="Add domain e.g. mybrand.com" />
                <Button>Add</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="pt-4">
          <Card className="shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Team Members</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {members.map((m,i)=>(
                <div key={i} className="flex items-center justify-between border rounded-xl p-3">
                  <div>
                    <div className="text-sm">{m.email}</div>
                    <div className="text-xs text-gray-500">{m.role}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline">Make admin</Button>
                    <Button size="sm" variant="outline">Remove</Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Input placeholder="Invite by email" />
                <Button>Invite</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
