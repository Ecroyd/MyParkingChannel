import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = getServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  return NextResponse.json({ user: user?.email ?? null, error: error?.message ?? null })
}


