'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { canManageMembers } from '@/lib/auth/permissions';
// Email sending removed - using invite links instead
// import { sendEmail } from '@/lib/email';
import { randomBytes } from 'crypto';

type ActionResult<T = void> = 
  | { success: true; data?: T }
  | { success: false; error: string };

type InviteResult = 
  | { success: true; inviteUrl: string }
  | { success: false; error: string };

/**
 * Invite a new member to the tenant
 * Returns an invite URL instead of sending an email
 */
export async function inviteMember(formData: FormData): Promise<InviteResult> {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return { success: false, error: 'Not authenticated' };
  }

  if (!canManageMembers(ctx.role)) {
    return { success: false, error: 'You do not have permission to manage members' };
  }

  const username = formData.get('username')?.toString().trim().toLowerCase();
  const role = formData.get('role')?.toString() as 'admin' | 'user' | null;

  if (!username || !/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { success: false, error: 'Username is required and can only contain letters, numbers, underscores, and hyphens' };
  }

  if (!role || !['admin', 'user'].includes(role)) {
    return { success: false, error: 'Role must be admin or user' };
  }

  const adminClient = await createAdminClient();

  // Check for existing unaccepted invitation with this username
  const { data: existingInvite } = await adminClient
    .from('tenant_invitations')
    .select('id, role')
    .eq('tenant_id', ctx.tenantId)
    .eq('email', username) // Using email field to store username
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existingInvite) {
    // Update existing invite role and regenerate token
    const token = randomBytes(32).toString('hex');
    const { error: updateError } = await adminClient
      .from('tenant_invitations')
      .update({
        role,
        token,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      })
      .eq('id', existingInvite.id);

    if (updateError) {
      return { success: false, error: 'Failed to update invitation' };
    }

    // Generate invite URL
    const inviteUrl = generateInviteUrl(token, ctx.tenantSlug);
    
    revalidatePath('/admin/settings/members');
    return { success: true, inviteUrl };
  }

  // Create new invitation
  const token = randomBytes(32).toString('hex');
  const { error: insertError } = await adminClient
    .from('tenant_invitations')
    .insert({
      tenant_id: ctx.tenantId,
      email: username, // Using email field to store username
      role,
      token,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    });

  if (insertError) {
    return { success: false, error: 'Failed to create invitation' };
  }

  // Generate invite URL
  const inviteUrl = generateInviteUrl(token, ctx.tenantSlug);
  
  revalidatePath('/admin/settings/members');
  return { success: true, inviteUrl };
}

/**
 * Update a member's role
 */
export async function updateMemberRole(userId: string, newRole: 'owner' | 'admin' | 'user'): Promise<ActionResult> {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return { success: false, error: 'Not authenticated' };
  }

  // Only owner can change roles
  if (ctx.role !== 'owner') {
    return { success: false, error: 'Only owners can change member roles' };
  }

  const adminClient = await createAdminClient();

  // Prevent demoting yourself from owner if you're the only owner
  if (userId === ctx.userId && ctx.role === 'owner' && newRole !== 'owner') {
    // Check if there's another owner
    const { data: otherOwners } = await adminClient
      .from('user_tenants')
      .select('user_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('role', 'owner')
      .neq('user_id', ctx.userId);

    if (!otherOwners || otherOwners.length === 0) {
      return { success: false, error: 'Cannot demote yourself from owner. Please promote another member to owner first.' };
    }
  }

  // Prevent demoting the last owner
  if (newRole !== 'owner') {
    const { data: currentMember } = await adminClient
      .from('user_tenants')
      .select('role')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', userId)
      .maybeSingle();

    if (currentMember?.role === 'owner') {
      // Check if there's another owner
      const { data: otherOwners } = await adminClient
        .from('user_tenants')
        .select('user_id')
        .eq('tenant_id', ctx.tenantId)
        .eq('role', 'owner')
        .neq('user_id', userId);

      if (!otherOwners || otherOwners.length === 0) {
        return { success: false, error: 'Cannot demote the last owner. Please promote another member to owner first.' };
      }
    }
  }

  const { error: updateError } = await adminClient
    .from('user_tenants')
    .update({ role: newRole })
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', userId);

  if (updateError) {
    return { success: false, error: 'Failed to update member role' };
  }

  revalidatePath('/admin/settings/members');
  return { success: true };
}

/**
 * Remove a member from the tenant
 */
export async function removeMember(userId: string): Promise<ActionResult> {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return { success: false, error: 'Not authenticated' };
  }

  // Only owner can remove members
  if (ctx.role !== 'owner') {
    return { success: false, error: 'Only owners can remove members' };
  }

  const adminClient = await createAdminClient();

  // Prevent removing yourself if you're the only owner
  if (userId === ctx.userId) {
    const { data: otherOwners } = await adminClient
      .from('user_tenants')
      .select('user_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('role', 'owner')
      .neq('user_id', ctx.userId);

    if (!otherOwners || otherOwners.length === 0) {
      return { success: false, error: 'Cannot remove yourself. Please promote another member to owner first.' };
    }
  }

  // Check if this is the last owner
  const { data: member } = await adminClient
    .from('user_tenants')
    .select('role')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (member?.role === 'owner') {
    const { data: otherOwners } = await adminClient
      .from('user_tenants')
      .select('user_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('role', 'owner')
      .neq('user_id', userId);

    if (!otherOwners || otherOwners.length === 0) {
      return { success: false, error: 'Cannot remove the last owner. Please promote another member to owner first.' };
    }
  }

  const { error: deleteError } = await adminClient
    .from('user_tenants')
    .delete()
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', userId);

  if (deleteError) {
    return { success: false, error: 'Failed to remove member' };
  }

  revalidatePath('/admin/settings/members');
  return { success: true };
}

/**
 * Cancel a pending invitation
 */
export async function cancelInvitation(invitationId: string): Promise<ActionResult> {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return { success: false, error: 'Not authenticated' };
  }

  if (!canManageMembers(ctx.role)) {
    return { success: false, error: 'You do not have permission to manage members' };
  }

  const adminClient = await createAdminClient();

  const { error: deleteError } = await adminClient
    .from('tenant_invitations')
    .delete()
    .eq('id', invitationId)
    .eq('tenant_id', ctx.tenantId);

  if (deleteError) {
    return { success: false, error: 'Failed to cancel invitation' };
  }

  revalidatePath('/admin/settings/members');
  return { success: true };
}

/**
 * Resend an invitation - returns the invite URL
 */
export async function resendInvitation(invitationId: string): Promise<InviteResult> {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return { success: false, error: 'Not authenticated' };
  }

  if (!canManageMembers(ctx.role)) {
    return { success: false, error: 'You do not have permission to manage members' };
  }

  const adminClient = await createAdminClient();

  const { data: invite, error: fetchError } = await adminClient
    .from('tenant_invitations')
    .select('email, role, token')
    .eq('id', invitationId)
    .eq('tenant_id', ctx.tenantId)
    .is('accepted_at', null)
    .maybeSingle();

  if (fetchError || !invite) {
    return { success: false, error: 'Invitation not found' };
  }

  // Generate invite URL
  const inviteUrl = generateInviteUrl(invite.token, ctx.tenantSlug);
  
  return { success: true, inviteUrl };
}

/**
 * Helper to generate invite URL
 * (Email sending removed - using invite links instead)
 */
function generateInviteUrl(token: string, tenantSlug: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  return `${baseUrl}/accept-invite?token=${token}&tenant=${tenantSlug}`;
}

