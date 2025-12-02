import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import AcceptInviteClient from './AcceptInviteClient';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; tenant?: string }>;
}) {
  const params = await searchParams;
  const token = params.token;
  const tenantSlug = params.tenant;

  if (!token) {
    redirect('/login?error=missing_token');
  }

  const supabase = await createServerClient();
  const adminClient = await createAdminClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();

  // Look up invitation
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

  // Get tenant details
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('id, name, slug')
    .eq('id', invitation.tenant_id)
    .maybeSingle();

  if (!tenant) {
    redirect('/login?error=tenant_not_found');
  }

  // If user is not logged in, redirect to login with redirect back
  if (!user) {
    const redirectUrl = `/accept-invite?token=${token}${tenantSlug ? `&tenant=${tenantSlug}` : ''}`;
    redirect(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
  }

  // Check if user email matches invitation email
  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <AcceptInviteClient
        error="This invitation was sent to a different email address. Please log in with the email that received the invitation."
        tenantName={tenant.name}
      />
    );
  }

  // Check if user is already a member
  const { data: existingMembership } = await adminClient
    .from('user_tenants')
    .select('user_id')
    .eq('tenant_id', invitation.tenant_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingMembership) {
    // Already a member, just redirect to admin
    redirect(`/admin`);
  }

  // Accept the invitation (server action will handle this)
  return (
    <AcceptInviteClient
      invitationId={invitation.id}
      token={token}
      tenantId={invitation.tenant_id}
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      role={invitation.role}
      userEmail={user.email}
    />
  );
}

