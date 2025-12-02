'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

type ActionResult<T = void> = 
  | { success: true; data?: T }
  | { success: false; error: string };

/**
 * Accept an invitation
 */
export async function acceptInvite(
  invitationId: string,
  token: string,
  tenantId: string
): Promise<ActionResult> {
  const supabase = await createServerClient();
  const adminClient = await createAdminClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify invitation
  const { data: invitation, error: inviteError } = await adminClient
    .from('tenant_invitations')
    .select('id, tenant_id, email, role, expires_at, accepted_at')
    .eq('id', invitationId)
    .eq('token', token)
    .eq('tenant_id', tenantId)
    .is('accepted_at', null)
    .maybeSingle();

  if (inviteError || !invitation) {
    return { success: false, error: 'Invitation not found or already accepted' };
  }

  // Check if expired
  if (new Date(invitation.expires_at) < new Date()) {
    return { success: false, error: 'Invitation has expired' };
  }

  // Check if email matches
  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return { success: false, error: 'This invitation was sent to a different email address' };
  }

  // Check if already a member
  const { data: existingMembership } = await adminClient
    .from('user_tenants')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingMembership) {
    // Already a member, just mark invitation as accepted
    await adminClient
      .from('tenant_invitations')
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: user.id,
      })
      .eq('id', invitationId);
    
    revalidatePath('/admin');
    return { success: true };
  }

  // Insert into user_tenants (trigger will handle is_default)
  const { error: insertError } = await adminClient
    .from('user_tenants')
    .insert({
      user_id: user.id,
      tenant_id: tenantId,
      role: invitation.role,
    });

  if (insertError) {
    return { success: false, error: 'Failed to join tenant' };
  }

  // Mark invitation as accepted
  const { error: updateError } = await adminClient
    .from('tenant_invitations')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by_user_id: user.id,
    })
    .eq('id', invitationId);

  if (updateError) {
    // Non-critical, but log it
    console.error('Failed to mark invitation as accepted:', updateError);
  }

  revalidatePath('/admin');
  return { success: true };
}

