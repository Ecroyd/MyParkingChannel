import { Suspense } from 'react'
import { createServerClientDirect } from '@/lib/supabase/server-direct'
import { requireUser } from '@/lib/auth/requireUser'
import BookingRulesPageClient from '@/components/admin/BookingRulesPageClient'

export default async function BookingRulesPage() {
  const user = await requireUser()
  const supabase = createServerClientDirect({ admin: true })

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

  if (tenantError || !userTenant?.tenants) {
    return (
      <div className="p-6">
        <div className="text-red-600">Error loading tenant information</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Booking Rules</h1>
        <p className="text-gray-600 mt-2">
          Configure blackout periods and surcharges for your parking bookings
        </p>
      </div>

      <Suspense fallback={<div>Loading booking rules...</div>}>
        <BookingRulesPageClient tenant={userTenant.tenants} />
      </Suspense>
    </div>
  )
}
