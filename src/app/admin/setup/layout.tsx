import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

/**
 * Setup layout - allows rendering without tenant context
 * This is for users who have no tenants yet (first-time signups)
 */
export default async function SetupLayout({ children }: { children: ReactNode }) {
  const supabase = await createServerClient();
  const adminClient = await createAdminClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/login');
  }

  // Check if user already has tenants
  const { data: userTenants } = await adminClient
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1);

  // If user has tenants, they shouldn't be on setup page
  if (userTenants && userTenants.length > 0) {
    redirect('/admin');
  }

  // Allow setup page to render without tenant context
  return <>{children}</>;
}

