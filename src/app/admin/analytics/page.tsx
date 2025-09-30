import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard';

export default async function AnalyticsPage() {
  const supabase = await createServerClient();
  const adminClient = await createAdminClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-gray-600">Please log in to continue</p>
            <Link href="/login" className="inline-flex items-center rounded-md border px-3 py-2 text-sm">
              Go to Login
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Get user's tenants
  console.log('🔍 Analytics: Checking user_tenants for user:', user.id)
  const { data: userTenants, error: userTenantsError } = await adminClient
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (userTenantsError) {
    console.log('❌ Analytics: Error fetching user tenants:', userTenantsError)
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-gray-600">Error loading tenant data</p>
            <p className="text-sm text-gray-500">{userTenantsError.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  console.log('📊 Analytics: User tenants found:', userTenants?.length || 0, userTenants)

  // Find the default tenant or use the first one
  const userTenant = userTenants?.find(ut => ut.is_default) || userTenants?.[0];

  if (!userTenant?.tenant_id) {
    console.log('ℹ️ Analytics: No tenant found for user')
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-gray-600">No tenant access found</p>
            <p className="text-sm text-gray-500">Please complete setup to access analytics.</p>
            <Link href="/admin/setup" className="inline-flex items-center rounded-md border px-3 py-2 text-sm">
              Go to Setup
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  console.log('✅ Analytics: Using tenant:', userTenant.tenant_id)

  // Get tenant details
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('id, name, slug, timezone, default_capacity')
    .eq('id', userTenant.tenant_id)
    .single();

  if (!tenant) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-gray-600">Tenant not found</p>
            <p className="text-sm text-gray-500">The tenant associated with your account could not be found.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Comprehensive revenue and occupancy analytics with export capabilities
        </p>
        <p className="text-xs text-muted-foreground">Tenant: {tenant.name} ({tenant.slug})</p>
      </div>
      <AnalyticsDashboard tenantId={tenant.id} />
    </section>
  );
}

