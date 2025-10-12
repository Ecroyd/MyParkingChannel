// app/admin/payments/page.tsx
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import PaymentsClient from './PaymentsClient';

export default async function PaymentsAdmin() {
  const supabase = await createServerClient();
  const adminClient = await createAdminClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold mb-4">Payments</h1>
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
      </main>
    );
  }

  // Get user's tenants
  console.log('🔍 Payments: Checking user_tenants for user:', user.id)
  const { data: userTenants, error: userTenantsError } = await adminClient
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (userTenantsError) {
    console.log('❌ Payments: Error fetching user tenants:', userTenantsError)
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold mb-4">Payments</h1>
        <Card className="shadow-soft">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <p className="text-gray-600">Error loading tenant data</p>
              <p className="text-sm text-gray-500">{userTenantsError.message}</p>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  console.log('📊 Payments: User tenants found:', userTenants?.length || 0, userTenants)

  // Find the default tenant or use the first one
  const userTenant = userTenants?.find(ut => ut.is_default) || userTenants?.[0];

  if (!userTenant?.tenant_id) {
    console.log('ℹ️ Payments: No tenant found for user')
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold mb-4">Payments</h1>
        <Card className="shadow-soft">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <p className="text-gray-600">No tenant access found</p>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  console.log('✅ Payments: Using tenant:', userTenant.tenant_id)

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold mb-4">Payments</h1>
      <PaymentsClient />
    </main>
  );
}