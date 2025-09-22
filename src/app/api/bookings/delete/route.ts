import { withTenant } from '@/lib/tenant/withTenant'
import { createTenantScopedClient } from '@/lib/rls/context'
import { requireUser } from '@/lib/auth/requireUser'
import { TenantContext } from '@/lib/tenant/resolveTenant'

export const POST = withTenant(async (tenant: TenantContext, request: Request) => {
  const user = await requireUser()
  const supabase = await createTenantScopedClient(tenant, user.id)
  
  const body = await request.json()
  const { id } = body
  
  if (!id) {
    return Response.json({ error: 'Booking ID is required' }, { status: 400 })
  }

  // Get current booking for audit
  const { data: currentBooking } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', tenant.tenant_id)
    .single()

  if (!currentBooking) {
    return Response.json({ error: 'Booking not found' }, { status: 404 })
  }

  // Soft delete by setting status to cancelled
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('tenant_id', tenant.tenant_id)
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  // Log audit event
  await supabase
    .from('audit_logs')
    .insert({
      tenant_id: tenant.tenant_id,
      actor_user_id: user.id,
      action: 'delete',
      entity: 'booking',
      entity_id: id,
      metadata: { 
        previous: currentBooking,
        reason: 'soft_delete'
      }
    })

  return Response.json(data)
})

