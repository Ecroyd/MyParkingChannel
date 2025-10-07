import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import PaymentsClient from './PaymentsClient';

export default async function PaymentsPage() {
  const supabase = await getServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return <div>Unauthorized</div>;
  }

  // Get user's tenant
  const { data: userTenant, error: tenantError } = await supabase
    .from('user_tenants')
    .select(`
      tenant_id,
      tenants (
        id,
        name,
        slug
      )
    `)
    .eq('user_id', user.id)
    .single();

  if (tenantError || !userTenant) {
    return <div>No tenant found</div>;
  }

  // Get Stripe connection status
  const adminClient = await createAdminClient();
  const { data: stripeConnection } = await adminClient
    .from('tenant_stripe')
    .select('*')
    .eq('tenant_id', userTenant.tenant_id)
    .single();

  return (
    <PaymentsClient 
      tenant={userTenant.tenants as any}
      stripeConnection={stripeConnection}
    />
  );
}
