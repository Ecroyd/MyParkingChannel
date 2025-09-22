import { headers } from 'next/headers'
import { resolveTenant, TenantContext, TenantNotFoundError } from './resolveTenant'

export function withTenant<T extends any[]>(
  handler: (tenant: TenantContext, ...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    try {
      const headersList = await headers()
      const host = headersList.get('host') || ''
      const url = new URL(headersList.get('referer') || '')
      const tenantSlug = url.searchParams.get('tenant')

      const tenant = await resolveTenant(host, tenantSlug)
      return await handler(tenant, ...args)
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        return new Response(
          JSON.stringify({ error: 'Tenant not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }
      throw error
    }
  }
}

