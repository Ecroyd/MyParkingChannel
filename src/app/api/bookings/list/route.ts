import { withTenant } from '@/lib/tenant/withTenant'
import { createTenantScopedClient } from '@/lib/rls/context'
import { requireUser } from '@/lib/auth/requireUser'
import { TenantContext } from '@/lib/tenant/resolveTenant'

export const POST = withTenant(async (tenant: TenantContext, request: Request) => {
  const user = await requireUser()
  const supabase = await createTenantScopedClient(tenant, user.id)
  
  const body = await request.json()
  const { 
    start_date, 
    end_date, 
    status, 
    search,
    page = 1,
    limit = 50
  } = body

  let query = supabase
    .from('bookings')
    .select(`
      *,
      customers(name, email, phone)
    `)
    .eq('tenant_id', tenant.tenant_id)
    .order('start_at', { ascending: false })

  if (start_date) {
    query = query.gte('start_at', start_date)
  }
  if (end_date) {
    query = query.lte('start_at', end_date)
  }
  if (status) {
    query = query.eq('status', status)
  }
  if (search) {
    query = query.or(`reference.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,plate.ilike.%${search}%`)
  }

  const from = (page - 1) * limit
  const to = from + limit - 1

  const { data, error, count } = await query
    .range(from, to)
    .select('*', { count: 'exact' })

  if (error) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  return Response.json({
    data: data || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit)
    }
  })
})

