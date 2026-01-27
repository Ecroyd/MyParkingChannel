// src/app/admin/bookings-server/page.tsx
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import BookingsServerClient from './BookingsServerClient';

export default async function BookingsServerPage() {
  const supabase = await createServerClient();
  const adminClient = await createAdminClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Please log in to continue</p>
        </div>
      </div>
    );
  }

  console.log('🔍 Bookings: Checking user_tenants for user:', user.id)

  // Get user's tenants
  const { data: userTenants, error: userTenantsError } = await adminClient
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (userTenantsError) {
    console.log('❌ Bookings: Error fetching user tenants:', userTenantsError)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Error loading tenant data</p>
        </div>
      </div>
    );
  }

  console.log('📊 Bookings: User tenants found:', userTenants?.length || 0, userTenants)

  // Find the default tenant or use the first one
  const userTenant = userTenants?.find(ut => ut.is_default) || userTenants?.[0];

  if (!userTenant?.tenant_id) {
    console.log('ℹ️ Bookings: No tenant found for user')
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No tenant access found</p>
        </div>
      </div>
    );
  }

  console.log('✅ Bookings: Using tenant:', userTenant.tenant_id)

  // Get tenant details
  const { data: tenant, error: tenantError } = await adminClient
    .from('tenants')
    .select('id, name, slug, timezone, default_capacity')
    .eq('id', userTenant.tenant_id)
    .single();

  if (tenantError || !tenant) {
    console.log('❌ Bookings: Error fetching tenant details:', tenantError)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Error loading tenant details</p>
        </div>
      </div>
    );
  }

  console.log('📊 Bookings: Tenant details found:', tenant)

  // Get bookings using admin client to bypass RLS
  console.log('🔍 Bookings: Fetching bookings for tenant:', tenant.id)
  
  let bookings: any[] = [];
  
  try {
    const { data: bookingsData, error: bookingsError } = await adminClient
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (bookingsError) {
      console.log('❌ Bookings: Error fetching bookings:', bookingsError)
      console.log('❌ Bookings: Error details:', JSON.stringify(bookingsError, null, 2))
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-600">Error loading bookings: {bookingsError.message}</p>
            <p className="text-sm text-gray-500 mt-2">Check console for details</p>
          </div>
        </div>
      );
    }

    bookings = bookingsData || [];
    console.log('📊 Bookings: Bookings found:', bookings.length)
    if (bookings.length > 0) {
      console.log('📊 Bookings: Sample booking:', bookings[0])
    }
  } catch (error) {
    console.log('❌ Bookings: Exception during query:', error)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Exception loading bookings: {error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  return (
    <BookingsServerClient
      user={user}
      tenant={tenant}
      bookings={bookings}
    />
  );
}
