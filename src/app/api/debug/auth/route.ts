import { NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';
import { requirePlatformAdminApi } from '@/lib/auth/apiGuards';

export async function GET() {
  const guard = await requirePlatformAdminApi();
  if (guard.response) return guard.response;
  const sb = await getServerSupabase();
  const { data: { user }, error } = await sb.auth.getUser();
  return NextResponse.json({ user, error: error?.message ?? null });
}
