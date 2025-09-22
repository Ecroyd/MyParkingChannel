'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function SetupPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<any>(null)
  const [tenant, setTenant] = useState<any>(null)
  const [tenantName, setTenantName] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [timezone, setTimezone] = useState('Europe/London')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  useEffect(() => {
    async function checkUserAndTenant() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          router.push('/login')
          return
        }

        setUser(user)

        // Check if user already has a tenant
        const tenantResponse = await fetch('/api/onboarding/check-tenant', {
          credentials: 'include'
        })
        
        if (tenantResponse.ok) {
          const { hasTenant, tenant: existingTenant } = await tenantResponse.json()
          if (hasTenant && existingTenant) {
            setTenant(existingTenant)
            setTenantName(existingTenant.name)
            setTenantSlug(existingTenant.slug)
            setTimezone(existingTenant.timezone)
          }
        }
      } catch (err) {
        console.error('Setup check failed:', err)
        setError('Failed to check setup status')
      }
    }

    checkUserAndTenant()
  }, [])

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/onboarding/create-tenant', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tenantName,
          slug: tenantSlug,
          timezone
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        
        if (errorData.error && errorData.error.includes('duplicate key value violates unique constraint "tenants_slug_key"')) {
          setError('This business name is already taken. Please choose a different name.')
          return
        }
        
        throw new Error(errorData.error || 'Failed to create tenant')
      }

      const { tenant: newTenant } = await response.json()
      setTenant(newTenant)
      console.log('Tenant created successfully:', newTenant)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoToDashboard = () => {
    router.push('/admin/today')
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">
            {tenant ? 'Business Setup Complete' : 'Set up your business'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tenant ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded">
                ✅ Your business "{tenant.name}" is ready!
              </div>
              <div className="space-y-2">
                <p><strong>Business Name:</strong> {tenant.name}</p>
                <p><strong>URL Slug:</strong> {tenant.slug}</p>
                <p><strong>Timezone:</strong> {tenant.timezone}</p>
              </div>
              <Button onClick={handleGoToDashboard} className="w-full">
                Go to Dashboard
              </Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleCreateTenant}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label htmlFor="tenantName" className="block text-sm font-medium text-gray-700">
                    Business Name
                  </label>
                  <Input
                    id="tenantName"
                    name="tenantName"
                    type="text"
                    required
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="tenantSlug" className="block text-sm font-medium text-gray-700">
                    URL Slug
                  </label>
                  <Input
                    id="tenantSlug"
                    name="tenantSlug"
                    type="text"
                    required
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Your dashboard will be available at {tenantSlug}.localhost:3002
                  </p>
                </div>
                <div>
                  <label htmlFor="timezone" className="block text-sm font-medium text-gray-700">
                    Timezone
                  </label>
                  <select
                    id="timezone"
                    name="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Europe/London">Europe/London</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
                    <option value="Europe/Paris">Europe/Paris</option>
                    <option value="Asia/Tokyo">Asia/Tokyo</option>
                  </select>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full"
              >
                {loading ? 'Creating...' : 'Create Business'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

