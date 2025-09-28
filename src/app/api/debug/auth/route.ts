import { NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  const sb = getServerSupabase();
  const { data: { user }, error } = await sb.auth.getUser();
  return NextResponse.json({ user, error: error?.message ?? null });
}
