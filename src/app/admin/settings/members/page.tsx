import { redirect } from 'next/navigation';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { canManageMembers } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/server-admin';
import MembersClient from './MembersClient';

export default async function MembersPage() {
  const ctx = await getCurrentTenantContext();
  
  if (!ctx) {
    redirect('/login');
  }

  if (!canManageMembers(ctx.role)) {
    redirect('/admin');
  }

  const adminClient = await createAdminClient();

  // Fetch current members
  const { data: membersRaw, error: membersError } = await adminClient
    .from('user_tenants')
    .select(`
      user_id,
      role,
      is_default,
      created_at,
      users:user_id (
        id,
        email
      )
    `)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: true });

  // Transform members: Supabase returns users as an array even for one-to-one relationships
  const members = membersRaw?.map((m: any) => ({
    user_id: m.user_id,
    role: m.role,
    is_default: m.is_default,
    created_at: m.created_at,
    users: Array.isArray(m.users) && m.users.length > 0 ? m.users[0] : null,
  })) || [];

  // Fetch pending invitations
  const { data: invitations, error: invitationsError } = await adminClient
    .from('tenant_invitations')
    .select('id, email, role, created_at, expires_at')
    .eq('tenant_id', ctx.tenantId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  // Check how many owners exist
  const ownerCount = members.filter((m) => m.role === 'owner').length;

  return (
    <MembersClient
      members={members}
      invitations={invitations || []}
      currentUserId={ctx.userId}
      currentUserRole={ctx.role}
      isOnlyOwner={ownerCount === 1 && ctx.role === 'owner'}
    />
  );
}

