import { redirect } from 'next/navigation'
import { getServerSupabase } from '@/lib/supabase/server'

export async function requireUser() {
  const supabase = getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return user
}
