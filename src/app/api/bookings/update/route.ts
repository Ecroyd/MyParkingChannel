import { withTenant } from '@/lib/tenant/withTenant'
import { createTenantScopedClient } from '@/lib/rls/context'
import { requireUser } from '@/lib/auth/requireUser'
import { TenantContext } from '@/lib/tenant/resolveTenant'
import { bookingUpdateSchema } from '@/lib/validation/booking'

export const POST = withTenant(async (tenant: TenantContext, request: Request) => {
  const user = await requireUser()
  const supabase = await createTenantScopedClient(tenant, user.id)
  
  const body = await request.json()
  const { id, ...updateData } = body
  
  if (!id) {
    return Response.json({ error: 'Booking ID is required' }, { status: 400 })
  }

  try {
    const validatedData = bookingUpdateSchema.parse(updateData)
    
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

    const { data, error } = await supabase
      .from('bookings')
      .update(validatedData)
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
        action: 'update',
        entity: 'booking',
        entity_id: id,
        metadata: { 
          changes: validatedData,
          previous: currentBooking
        }
      })

    return Response.json(data)
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 400 })
  }
})

