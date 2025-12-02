'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { canManageMembers } from '@/lib/auth/permissions';
import { sendEmail } from '@/lib/email';
import { randomBytes } from 'crypto';

type ActionResult<T = void> = 
  | { success: true; data?: T }
  | { success: false; error: string };

/**
 * Invite a new member to the tenant
 */
export async function inviteMember(formData: FormData): Promise<ActionResult> {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return { success: false, error: 'Not authenticated' };
  }

  if (!canManageMembers(ctx.role)) {
    return { success: false, error: 'You do not have permission to manage members' };
  }

  const email = formData.get('email')?.toString().trim().toLowerCase();
  const role = formData.get('role')?.toString() as 'admin' | 'user' | null;

  if (!email || !email.includes('@')) {
    return { success: false, error: 'Valid email is required' };
  }

  if (!role || !['admin', 'user'].includes(role)) {
    return { success: false, error: 'Role must be admin or user' };
  }

  const supabase = await createServerClient();
  const adminClient = await createAdminClient();

  // Check if user already exists and is already a member
  const { data: existingUsers } = await adminClient.auth.admin.listUsers();
  const existingUser = existingUsers.users.find((u: any) => u.email === email);

  if (existingUser) {
    const { data: existingMembership } = await adminClient
      .from('user_tenants')
      .select('user_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('user_id', existingUser.id)
      .maybeSingle();

    if (existingMembership) {
      return { success: false, error: 'User is already a member of this tenant' };
    }
  }

  // Check for existing unaccepted invitation
  const { data: existingInvite } = await adminClient
    .from('tenant_invitations')
    .select('id, role')
    .eq('tenant_id', ctx.tenantId)
    .eq('email', email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (existingInvite) {
    // Update existing invite role and resend
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

    // Send email
    await sendInviteEmail(email, token, ctx.tenantSlug, role);
    revalidatePath('/admin/settings/members');
    return { success: true };
  }

  // Create new invitation
  const token = randomBytes(32).toString('hex');
  const { error: insertError } = await adminClient
    .from('tenant_invitations')
    .insert({
      tenant_id: ctx.tenantId,
      email,
      role,
      token,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    });

  if (insertError) {
    return { success: false, error: 'Failed to create invitation' };
  }

  // Send email
  await sendInviteEmail(email, token, ctx.tenantSlug, role);
  revalidatePath('/admin/settings/members');
  return { success: true };
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
 * Resend an invitation email
 */
export async function resendInvitation(invitationId: string): Promise<ActionResult> {
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

  await sendInviteEmail(invite.email, invite.token, ctx.tenantSlug, invite.role);
  return { success: true };
}

/**
 * Helper to send invitation email
 */
async function sendInviteEmail(email: string, token: string, tenantSlug: string, role: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const inviteUrl = `${baseUrl}/accept-invite?token=${token}&tenant=${tenantSlug}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>You've been invited to join a team</h2>
      <p>You've been invited to join as a <strong>${role}</strong>.</p>
      <p>
        <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px;">
          Accept Invitation
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">
        Or copy and paste this link into your browser:<br>
        <a href="${inviteUrl}">${inviteUrl}</a>
      </p>
      <p style="color: #666; font-size: 12px; margin-top: 24px;">
        This invitation will expire in 7 days.
      </p>
    </div>
  `;

  await sendEmail(email, `You've been invited to join ${tenantSlug}`, html);
}

