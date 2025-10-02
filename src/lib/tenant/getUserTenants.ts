// src/lib/tenant/getUserTenants.ts
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export interface UserTenant {
  role: string;
  is_default: boolean;
  tenants: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
  };
}

/**
 * Fetches tenants for the logged-in user
 * Uses admin client to avoid RLS recursion issues
 */
export async function getUserTenants(userId: string): Promise<UserTenant[]> {
  const adminClient = await createAdminClient();
  
  const { data, error } = await adminClient
    .from('user_tenants')
    .select(`
      role,
      is_default,
      tenants (
        id,
        slug,
        name,
        timezone
      )
    `)
    .eq('user_id', userId)
    .order('is_default', { ascending: false });

  if (error) {
    console.error('Error fetching user tenants:', error);
    throw error;
  }

  return (data as any) || [];
}

/**
 * Gets the user's default tenant
 */
export async function getDefaultTenant(userId: string): Promise<UserTenant | null> {
  const tenants = await getUserTenants(userId);
  return tenants.find(t => t.is_default) || null;
}

/**
 * Gets all tenants for a user (including non-default)
 */
export async function getAllUserTenants(userId: string): Promise<UserTenant[]> {
  return await getUserTenants(userId);
}
