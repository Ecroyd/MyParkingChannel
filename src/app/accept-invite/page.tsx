import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; tenant?: string }>;
}) {
  const params = await searchParams;
  const token = params.token;

  if (!token) {
    redirect('/login?error=missing_token');
  }

  const supabase = await createServerClient();
  const adminClient = await createAdminClient();

  // Look up invitation by token FIRST (before checking user)
  // We need the invitation data to know the username for signup
  const { data: invitation, error: inviteError } = await adminClient
    .from('tenant_invitations')
    .select('id, tenant_id, email, role, expires_at, accepted_at')
    .eq('token', token)
    .is('accepted_at', null)
    .maybeSingle();

  if (inviteError || !invitation) {
    redirect('/login?error=invalid_invitation');
  }

  // Check if expired
  if (new Date(invitation.expires_at) < new Date()) {
    redirect('/login?error=invitation_expired');
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  // If user is not logged in, redirect to signup with username pre-filled
  if (!user) {
    const redirectUrl = `/accept-invite?token=${encodeURIComponent(token)}${params.tenant ? `&tenant=${encodeURIComponent(params.tenant)}` : ''}`;
    redirect(`/signup?username=${encodeURIComponent(invitation.email)}&redirect=${encodeURIComponent(redirectUrl)}`);
  }

  // Check if username matches (stored in email field, actual username in user_metadata)
  const userUsername = user.user_metadata?.username;
  if (userUsername?.toLowerCase() !== invitation.email.toLowerCase()) {
    // Username mismatch - redirect to signup with correct username
    const redirectUrl = `/accept-invite?token=${encodeURIComponent(token)}`;
    redirect(`/signup?username=${encodeURIComponent(invitation.email)}&redirect=${encodeURIComponent(redirectUrl)}`);
  }

  // Check if user is already a member
  const { data: existingMembership } = await adminClient
    .from('user_tenants')
    .select('user_id')
    .eq('tenant_id', invitation.tenant_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingMembership) {
    // Already a member, mark invite as accepted and redirect
    await adminClient
      .from('tenant_invitations')
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by_user_id: user.id,
      })
      .eq('id', invitation.id);
    
    redirect('/admin');
  }

  // Create membership (server-side, no client action needed)
  const { error: insertError } = await adminClient
    .from('user_tenants')
    .insert({
      user_id: user.id,
      tenant_id: invitation.tenant_id,
      role: invitation.role,
      // is_default will be handled by trigger if this is their first tenant
    });

  if (insertError) {
    console.error('[accept-invite] Failed to create membership:', insertError);
    redirect('/login?error=invite_failed');
  }

  // Mark invitation as accepted
  const { error: updateError } = await adminClient
    .from('tenant_invitations')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by_user_id: user.id,
    })
    .eq('id', invitation.id);

  if (updateError) {
    console.error('[accept-invite] Failed to mark invitation as accepted:', updateError);
    // Non-critical, continue anyway
  }

  // Redirect to admin - user now has tenant membership
  redirect('/admin');
}

