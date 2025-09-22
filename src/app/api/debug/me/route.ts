import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await getServerSupabase()
  const { data: { user }, error } = await supabase.auth.getUser()
  return NextResponse.json({ user: user ? { id: user.id, email: user.email } : null, error })
}
