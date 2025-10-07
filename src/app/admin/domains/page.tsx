'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Globe, Plus, Search, CheckCircle, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface Tenant {
  id: string
  name: string
  slug: string
  role: string
  is_default: boolean
}

interface User {
  id: string
  email: string
}

export default function DomainsPage() {
  const [email, setEmail] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenant, setSelectedTenant] = useState('')
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const { toast } = useToast()

  const findUser = async () => {
    if (!email) {
      toast({
        title: 'Error',
        description: 'Please enter an email address',
        variant: 'destructive'
      })
      return
    }

    setSearching(true)
    try {
      const response = await fetch(`/api/admin/domains/find-tenant?email=${encodeURIComponent(email)}`)
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to find user')
      }

      setUser(data.user)
      setTenants(data.tenants)
      
      if (data.tenants.length === 1) {
        setSelectedTenant(data.tenants[0].id)
      }

      toast({
        title: 'Success',
        description: `Found user with ${data.tenants.length} tenant(s)`
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      })
    } finally {
      setSearching(false)
    }
  }

  const addDomain = async () => {
    if (!domain || !selectedTenant) {
      toast({
        title: 'Error',
        description: 'Please enter a domain and select a tenant',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/admin/domains/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain,
          tenant_id: selectedTenant
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to add domain')
      }

      toast({
        title: 'Success',
        description: `Domain ${domain} successfully added!`
      })

      // Reset form
      setDomain('')
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Domain Management</h1>
        <p className="text-gray-600">Add custom domains to tenant sites</p>
      </div>

      {/* Find User Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Find User
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter user email (e.g., info@flyparksexeter.co.uk)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && findUser()}
            />
            <Button onClick={findUser} disabled={searching}>
              {searching ? 'Searching...' : 'Find User'}
            </Button>
          </div>

          {user && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Found user: <strong>{user.email}</strong>
              </AlertDescription>
            </Alert>
          )}

          {tenants.length > 0 && (
            <div className="space-y-2">
              <Label>Select Tenant:</Label>
              <div className="space-y-2">
                {tenants.map((tenant) => (
                  <div
                    key={tenant.id}
                    className={`p-3 border rounded-lg cursor-pointer ${
                      selectedTenant === tenant.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    }`}
                    onClick={() => setSelectedTenant(tenant.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{tenant.name}</div>
                        <div className="text-sm text-gray-500">Slug: {tenant.slug}</div>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline">{tenant.role}</Badge>
                        {tenant.is_default && (
                          <Badge variant="secondary">Default</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Domain Section */}
      {selectedTenant && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Domain
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                placeholder="exeterholidayparking.co.uk"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addDomain()}
              />
            </div>
            <Button onClick={addDomain} disabled={loading || !domain}>
              {loading ? 'Adding...' : 'Add Domain'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-gray-600">
            <p><strong>Step 1:</strong> Enter the user's email address and click "Find User"</p>
            <p><strong>Step 2:</strong> Select the tenant you want to add the domain to</p>
            <p><strong>Step 3:</strong> Enter the custom domain (e.g., exeterholidayparking.co.uk)</p>
            <p><strong>Step 4:</strong> Click "Add Domain" to link the domain to the tenant</p>
          </div>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Make sure the domain is already configured in Vercel before adding it here.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
