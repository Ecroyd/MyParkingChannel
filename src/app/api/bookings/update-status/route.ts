import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function POST(req: NextRequest) {
  const res = new NextResponse()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => req.cookies.get(n)?.value,
        set: (n: string, v: string, o: any) => { res.cookies.set({ name: n, value: v, ...o }) },
        remove: (n: string, o: any) => { res.cookies.set({ name: n, value: '', ...o }) },
      },
    }
  )

  // Check authentication
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { bookingId, status } = body

  if (!bookingId || !status) {
    return NextResponse.json({ error: 'Missing bookingId or status' }, { status: 400 })
  }

  // Validate status
  const validStatuses = ['reserved', 'checked_in', 'checked_out', 'cancelled']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Update the booking status
  const { data, error } = await supabase
    .from('bookings')
    .update({ 
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId)
    .select('id, reference, status')
    .single()

  if (error) {
    console.error('Error updating booking status:', error)
    return NextResponse.json({ error: 'Failed to update booking status' }, { status: 500 })
  }

  return NextResponse.json({ 
    success: true, 
    booking: data 
  }, { headers: res.headers })
}

