import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET() {
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
