import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requirePlatformAdminApi } from '@/lib/auth/apiGuards';

export async function GET() {
  const guard = await requirePlatformAdminApi();
  if (guard.response) return guard.response;
  const supabase = await getServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  return NextResponse.json({ user: user ? { id: user.id, email: user.email } : null, error })
}
