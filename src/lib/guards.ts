import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server-admin";

/**
 * Requires the current user to be a platform admin
 * @returns { sb, user, adminClient } - Regular client, user, and admin client
 */
export async function requirePlatformAdmin() {
  const sb = await createServerClient();
  const { data: { user } } = await sb.auth.getUser();
  
  if (!user) {
    throw new Error("Not authenticated");
  }

  // Check if user is platform admin using direct query
  const { data: platformAdmin, error } = await sb
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Error checking platform admin status:', error);
    throw new Error("Failed to verify admin status");
  }
  
  if (!platformAdmin) {
    throw new Error("Forbidden: Platform admin access required");
  }
  
  // Return both regular client and admin client
  const adminClient = await createAdminClient();
  return { sb, user, adminClient };
}

/**
 * Check if a user is a platform admin (without throwing)
 * @param userId - The user ID to check
 * @returns Promise<boolean> - True if user is platform admin
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  try {
    const adminClient = await createAdminClient();
    const { data: platformAdmin, error } = await adminClient
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error checking platform admin status:', error);
      return false;
    }
    
    return !!platformAdmin;
  } catch (error) {
    console.error('Error in isPlatformAdmin:', error);
    return false;
  }
}