import { getServerSupabase } from '@/lib/supabase/server';
import UploadClient from './UploadClient';

export default async function UploadPage() {
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

  return (
    <UploadClient 
      tenant={userTenant.tenants as any}
      tenantId={userTenant.tenant_id}
    />
  );
}
