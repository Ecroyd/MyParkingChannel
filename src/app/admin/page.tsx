// src/app/admin/page.tsx
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export const runtime = 'nodejs';

export default async function AdminPage() {
  const supabase = await createServerClient();
  const adminClient = createAdminClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/login');
  }

  // Check if user is platform admin
  const { data: platformAdmin } = await adminClient
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  
  const isPlatformAdmin = !!platformAdmin;

  // Get user's default tenant
  const { data: userTenant } = await adminClient
    .from('user_tenants')
    .select(`
      tenant_id,
      role,
      is_default,
      tenants (
        id,
        name,
        slug,
        timezone
      )
    `)
    .eq('user_id', user.id)
    .eq('is_default', true)
    .single();

  if (isPlatformAdmin) {
    // Platform admins go to tenants management
    redirect('/admin/tenants');
  } else if (userTenant?.tenant_id) {
    // Regular users go to their tenant dashboard
    redirect('/admin/dashboard-server');
  } else {
    // No tenant access - redirect to setup or show error
    redirect('/admin/setup');
  }
}
