import { resolveTenantByHost } from '@/lib/tenant/resolve-tenant'

export default async function TestSubdomainPage() {
  console.log('🧪 TestSubdomainPage: Starting subdomain test')
  
  try {
    const tenant = await resolveTenantByHost()
    console.log('🧪 TestSubdomainPage: resolveTenantByHost returned:', tenant)
    
    return (
      <div style={{padding: '20px', background: 'lightblue'}}>
        <h1>Subdomain Test Page</h1>
        <p>Tenant resolved: {tenant ? 'YES' : 'NO'}</p>
        {tenant && (
          <div>
            <p>ID: {tenant.id}</p>
            <p>Name: {tenant.name}</p>
            <p>Slug: {tenant.slug}</p>
          </div>
        )}
      </div>
    )
  } catch (error) {
    console.error('🧪 TestSubdomainPage: Error:', error)
    return (
      <div style={{padding: '20px', background: 'lightcoral'}}>
        <h1>Subdomain Test Page - ERROR</h1>
        <p>Error: {String(error)}</p>
      </div>
    )
  }
}
