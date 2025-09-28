import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  console.log('[Auth Bridge Debug] Starting auth bridge...');
  
  const supabase = await getServerSupabase();
  const { access_token, refresh_token } = await req.json();

  if (!access_token || !refresh_token) {
    console.log('[Auth Bridge Debug] Missing tokens');
    return NextResponse.json({ error: "Missing tokens" }, { status: 400 });
  }

  console.log('[Auth Bridge Debug] Setting session...');
  
  // This will properly set the session cookies
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) {
    console.log('[Auth Bridge Debug] Session error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.log('[Auth Bridge Debug] Session set successfully');
  const cookieList = (await cookies()).getAll();
  console.log('[Auth Bridge Debug] Cookies after session:', cookieList);
  
  return NextResponse.json({ ok: true });
}
