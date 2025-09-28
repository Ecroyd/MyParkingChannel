import { getServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = getServerSupabase()
    
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    return NextResponse.json({
      user: user ? {
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at,
        created_at: user.created_at
      } : null,
      session: session ? {
        access_token: session.access_token?.substring(0, 50) + '...',
        refresh_token: session.refresh_token?.substring(0, 50) + '...',
        expires_at: session.expires_at,
        expires_in: session.expires_in
      } : null,
      errors: {
        userError: userError?.message,
        sessionError: sessionError?.message
      }
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

