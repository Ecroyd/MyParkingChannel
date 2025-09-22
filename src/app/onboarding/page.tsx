'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authLoading, setAuthLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  
  // Step 1: Create Tenant
  const [tenantName, setTenantName] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [timezone, setTimezone] = useState('Europe/London')
  
  // Step 2: Invite teammates
  const [teammateEmail, setTeammateEmail] = useState('')
  
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function checkAuthAndTenant() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) {
          console.error('Auth error:', error)
          setError('Authentication error. Please try logging in again.')
          setAuthLoading(false)
          return
        }
        
        if (!user) {
          setError('User not authenticated. Please sign up or log in first.')
          setAuthLoading(false)
          return
        }
        
        setUser(user)
        
        // Check if user already has a tenant
        const tenantResponse = await fetch('/api/onboarding/check-tenant', {
          credentials: 'include'
        })
        
        if (tenantResponse.ok) {
          const { hasTenant, tenant } = await tenantResponse.json()
          
          if (hasTenant && tenant) {
            // User already has a tenant, redirect to admin dashboard
            console.log('Existing tenant found, redirecting to admin:', tenant)
            router.push('/admin/today')
            return
          }
        }
        
        setAuthLoading(false)
      } catch (err) {
        console.error('Auth check failed:', err)
        setError('Failed to check authentication. Please try again.')
        setAuthLoading(false)
      }
    }

    checkAuthAndTenant()
  }, [])

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Call the server action to create tenant
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
        
        // Handle duplicate slug error specifically
        if (errorData.error && errorData.error.includes('duplicate key value violates unique constraint "tenants_slug_key"')) {
          setError('This business name is already taken. Please choose a different name.')
          return
        }
        
        throw new Error(errorData.error || 'Failed to create tenant')
      }

      const { tenant } = await response.json()
      console.log('Tenant created successfully:', tenant)
      setStep(2)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleInviteTeammate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!teammateEmail) {
      setStep(3)
      return
    }

    setLoading(true)
    setError('')

    try {
      if (!user) throw new Error('User not authenticated')

      // Get user's tenant
      const { data: userTenant } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single()

      if (!userTenant) throw new Error('User tenant not found')

      // For now, just log the invitation
      // In a real app, you'd send an email invitation
      console.log(`Inviting ${teammateEmail} to tenant ${userTenant.tenant_id}`)
      
      setStep(3)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = () => {
    router.push('/admin/today')
  }

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Checking authentication...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Authentication Required</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center space-y-4">
              <p className="text-gray-600">You need to be logged in to set up your business.</p>
              <div className="space-y-2">
                <Button onClick={() => router.push('/login')} className="w-full">
                  Go to Login
                </Button>
                <Button onClick={() => router.push('/signup')} variant="outline" className="w-full">
                  Create Account
                </Button>
              </div>
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
          <CardTitle className="text-2xl text-center">Set up your parking business</CardTitle>
          <div className="flex justify-center space-x-2 mt-4">
            {[1, 2, 3].map((stepNum) => (
              <Badge
                key={stepNum}
                variant={step >= stepNum ? "default" : "secondary"}
                className="w-8 h-8 rounded-full flex items-center justify-center"
              >
                {stepNum}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {step === 1 && (
            <form className="space-y-4" onSubmit={handleCreateTenant}>
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
                    Your dashboard will be available at {tenantSlug}.{process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || 'localhost:3000'}
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
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Europe/London">Europe/London</option>
                    <option value="Europe/Paris">Europe/Paris</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="America/Los_Angeles">America/Los_Angeles</option>
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

          {step === 2 && (
            <form className="space-y-4" onSubmit={handleInviteTeammate}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="teammateEmail" className="block text-sm font-medium text-gray-700">
                    Invite Teammate (Optional)
                  </label>
                  <Input
                    id="teammateEmail"
                    name="teammateEmail"
                    type="email"
                    value={teammateEmail}
                    onChange={(e) => setTeammateEmail(e.target.value)}
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    You can invite team members later from the settings page.
                  </p>
                </div>
              </div>

              <div className="flex space-x-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? 'Sending...' : 'Continue'}
                </Button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                  <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="mt-2 text-lg font-medium text-gray-900">All set!</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Your parking business is ready to go. You can start managing bookings right away.
                </p>
              </div>

              <Button
                onClick={handleComplete}
                className="w-full"
              >
                Go to Dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

