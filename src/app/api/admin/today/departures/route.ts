import { withTenant } from '@/lib/tenant/withTenant'
import { createTenantScopedClient } from '@/lib/rls/context'
import { requireUser } from '@/lib/auth/requireUser'
import { TenantContext } from '@/lib/tenant/resolveTenant'
import { format, startOfDay, endOfDay } from 'date-fns'
import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz'

export const POST = withTenant(async (tenant: TenantContext, request: Request) => {
  const user = await requireUser()
  const supabase = await createTenantScopedClient(tenant, user.id)
  
  const body = await request.json()
  const { tenant: tenantSlug } = body

  // Get today's date in tenant timezone
  const now = new Date()
  const tenantDate = utcToZonedTime(now, tenant.timezone)
  const todayStart = startOfDay(tenantDate)
  const todayEnd = endOfDay(tenantDate)
  
  // Convert to UTC for database queries
  const todayStartUTC = zonedTimeToUtc(todayStart, tenant.timezone)
  const todayEndUTC = zonedTimeToUtc(todayEnd, tenant.timezone)

  try {
    const { data: departures, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenant.tenant_id)
      .gte('end_at', todayStartUTC.toISOString())
      .lte('end_at', todayEndUTC.toISOString())
      .order('end_at', { ascending: true })

    if (error) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    return Response.json(departures || [])
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 400 })
  }
})

