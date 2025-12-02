'use server';

import { createAdminClient } from '@/lib/supabase/server-admin';

/**
 * Auto-confirm a user after signup (since we use fake emails)
 */
export async function confirmUserAfterSignup(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = await createAdminClient();
    
    // Update user to confirm email
    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });

    if (error) {
      console.error('Error confirming user:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('Unexpected error confirming user:', err);
    return { success: false, error: err.message || 'Failed to confirm user' };
  }
}

