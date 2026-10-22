import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requirePlatformAdminApi } from '@/lib/auth/apiGuards';

export async function GET(req: NextRequest) {
  const guard = await requirePlatformAdminApi();
  if (guard.response) return guard.response;
  const supabase = await getServerSupabase()

  const { data: { user }, error } = await supabase.auth.getUser()
  const cookieNames = req.cookies.getAll().map(c => c.name)

  return NextResponse.json({ cookieNames, userId: user?.id ?? null, error: error?.message ?? null })
}
