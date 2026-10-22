import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requirePlatformAdminApi } from '@/lib/auth/apiGuards';

export async function GET(req: NextRequest) {
  const guard = await requirePlatformAdminApi();
  if (guard.response) return guard.response;
  const supabase = await getServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  return NextResponse.json({ user: user?.email ?? null, error: error?.message ?? null })
}


