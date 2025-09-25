'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, Building2 } from 'lucide-react'

interface Tenant {
  id: string
  slug: string
  name: string
  role: string
}

interface TenantSwitcherProps {
  currentTenant?: string
  onTenantChange?: (tenant: Tenant) => void
}

export function TenantSwitcher({ currentTenant, onTenantChange }: TenantSwitcherProps) {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    async function fetchTenants() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        // First, get user_tenants relationships
        const { data: userTenants, error: userTenantsError } = await supabase
          .from('user_tenants')
          .select('role, tenant_id')
          .eq('user_id', user.id)

        if (userTenantsError) {
          console.error('Error fetching user tenants:', userTenantsError)
          console.error('User ID:', user.id)
          setLoading(false)
          return
        }

        console.log('User tenants fetched:', userTenants)

        if (userTenants && userTenants.length > 0) {
          // Get tenant details for each relationship
          const tenantIds = userTenants.map(ut => ut.tenant_id)
          const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, slug, name')
            .in('id', tenantIds)

          if (tenantsError) {
            console.error('Error fetching tenants:', tenantsError)
            console.error('Tenant IDs:', tenantIds)
            setLoading(false)
            return
          }

          console.log('Tenants fetched:', tenants)

          if (tenants) {
            const formattedTenants = userTenants.map(ut => {
              const tenant = tenants.find(t => t.id === ut.tenant_id)
              return {
                id: tenant?.id || ut.tenant_id,
                slug: tenant?.slug || '',
                name: tenant?.name || 'Unknown Tenant',
                role: ut.role
              }
            }).filter(t => t.slug) // Filter out any tenants that couldn't be found
            
            setTenants(formattedTenants)
            
            // Set current tenant
            const current = formattedTenants.find(t => t.slug === currentTenant) || formattedTenants[0]
            setSelectedTenant(current)
          }
        }
      } catch (error) {
        console.error('Error in fetchTenants:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTenants()
  }, [currentTenant])

  const handleTenantChange = (tenant: Tenant) => {
    setSelectedTenant(tenant)
    onTenantChange?.(tenant)
    
    // Redirect to the tenant's admin page
    window.location.href = `/admin/today?tenant=${tenant.slug}`
  }

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <Building2 className="h-4 w-4" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    )
  }

  if (tenants.length === 0) {
    return (
      <div className="flex items-center space-x-2">
        <Building2 className="h-4 w-4" />
        <span className="text-sm text-muted-foreground">No tenants</span>
      </div>
    )
  }

  if (tenants.length === 1) {
    return (
      <div className="flex items-center space-x-2">
        <Building2 className="h-4 w-4" />
        <span className="font-medium">{selectedTenant?.name}</span>
        <Badge variant="secondary" className="text-xs">
          {selectedTenant?.role}
        </Badge>
      </div>
    )
  }

  return (
    <div className="flex items-center space-x-2">
      <Building2 className="h-4 w-4" />
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center space-x-2"
        >
          <span className="font-medium">{selectedTenant?.name}</span>
          <Badge variant="secondary" className="text-xs">
            {selectedTenant?.role}
          </Badge>
          <ChevronDown className="h-3 w-3" />
        </Button>
        
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border rounded-md shadow-lg z-50">
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              onClick={() => handleTenantChange(tenant)}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{tenant.name}</div>
                <div className="text-sm text-muted-foreground">{tenant.slug}</div>
              </div>
              <Badge variant="secondary" className="text-xs">
                {tenant.role}
              </Badge>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

