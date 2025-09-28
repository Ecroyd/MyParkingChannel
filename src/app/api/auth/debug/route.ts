import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await getServerSupabase()

  const { data: { user }, error } = await supabase.auth.getUser()
  const cookieNames = req.cookies.getAll().map(c => c.name)

  return NextResponse.json({ cookieNames, userId: user?.id ?? null, error: error?.message ?? null })
}
