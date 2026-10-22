import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { requirePlatformAdminApi } from '@/lib/auth/apiGuards';

export async function GET() {
  const guard = await requirePlatformAdminApi();
  if (guard.response) return guard.response;
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  let memberships = null;
  if (user) {
    const { data } = await supabase
      .from('user_tenants')
      .select('tenant_id, role, is_default, created_at')
      .eq('user_id', user.id);
    memberships = data;
  }

  return NextResponse.json({ user, memberships });
}
