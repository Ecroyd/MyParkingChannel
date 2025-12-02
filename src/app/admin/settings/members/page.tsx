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
  const { data: members, error: membersError } = await adminClient
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

  // Fetch pending invitations
  const { data: invitations, error: invitationsError } = await adminClient
    .from('tenant_invitations')
    .select('id, email, role, created_at, expires_at')
    .eq('tenant_id', ctx.tenantId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  // Check how many owners exist
  const ownerCount = members?.filter((m: any) => m.role === 'owner').length || 0;

  return (
    <MembersClient
      members={members || []}
      invitations={invitations || []}
      currentUserId={ctx.userId}
      currentUserRole={ctx.role}
      isOnlyOwner={ownerCount === 1 && ctx.role === 'owner'}
    />
  );
}

