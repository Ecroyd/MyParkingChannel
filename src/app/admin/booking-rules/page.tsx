import { Suspense } from 'react'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/requireUser'
import BookingRulesPageClient from '@/components/admin/BookingRulesPageClient'

export default async function BookingRulesPage() {
  const user = await requireUser()
  const supabase = await getServerSupabase({ admin: true })

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
    return (
      <div className="p-6">
        <div className="text-red-600">Error loading tenant information</div>
      </div>
    )
  }

  if (!userTenants || userTenants.length === 0) {
    return (
      <div className="p-6">
        <div className="text-red-600">No tenant access found</div>
      </div>
    )
  }

  // Find the default tenant or use the first one
  const userTenant = userTenants.find(ut => ut.is_default) || userTenants[0]

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Booking Rules</h1>
        <p className="text-gray-600 mt-2">
          Configure blackout periods and surcharges for your parking bookings
        </p>
      </div>

      <Suspense fallback={<div>Loading booking rules...</div>}>
        <BookingRulesPageClient tenant={userTenant.tenants as any} />
      </Suspense>
    </div>
  )
}
