import { getServerSupabase } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export async function getCurrentTenant() {
  const supabase = await getServerSupabase()

  // Get the current user first
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error('No authenticated user')
  }

  // 1) Try domain mapping first
  const host = (await headers()).get('host') ?? ''
  let tenant = null as null | { id: string; name: string; slug: string }
  if (host && !host.startsWith('localhost')) {
    const { data } = await supabase
      .from('tenant_domains')
      .select('tenants!inner(id, name, slug)')
      .eq('domain', host)
      .limit(1)
      .maybeSingle()
    if (data?.tenants) tenant = data.tenants as any
  }

  // 2) Fallback to the user's tenant membership
  if (!tenant) {
    const { data } = await supabase
      .from('user_tenants')
      .select('tenants!inner(id, name, slug)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()
    if (data?.tenants) tenant = data.tenants as any
  }

  if (!tenant) throw new Error('No tenant for current user')
  return tenant
}

