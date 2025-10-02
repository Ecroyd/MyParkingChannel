import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase()

  // Who is calling?
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const body = await req.json().catch((err) => {
    console.error('JSON parse error:', err)
    return {} as any
  })
  
  console.log('Test update - received data:', body)
  
  // Just try to update a simple field
  const { data, error } = await supabase
    .from('bookings')
    .update({ notes: 'Test update from API' })
    .eq('id', body.bookingId)
    .select('*')
    .single()

  if (error) {
    console.error('Test update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ success: true, data })
}
