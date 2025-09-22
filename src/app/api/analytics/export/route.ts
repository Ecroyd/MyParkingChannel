import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start') ?? ''
  const end   = searchParams.get('end')   ?? ''
  const tz    = searchParams.get('tz')    ?? 'Europe/London'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  const res = new NextResponse()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => req.cookies.get(n)?.value,
        set: (n, v, o) => res.cookies.set({ name: n, value: v, ...o }),
        remove: (n, o) => res.cookies.set({ name: n, value: '', ...o }),
      },
    }
  )

  const { data, error } = await supabase.rpc('analytics_finance', {
    start_date: start, end_date: end, tz
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 401 })

  // CSV header
  const rows = (data ?? []) as any[]
  const header = ['day','channel','bookings','money_received','money_charged']
  const csv = [
    header.join(','),
    ...rows.map(r => [
      r.day,
      r.channel,
      Number(r.bookings),
      Number(r.money_received).toFixed(2),
      Number(r.money_charged).toFixed(2)
    ].join(','))
  ].join('\n')

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="analytics_${start}_to_${end}.csv"`,
      ...Object.fromEntries(res.headers), // propagate any cookie refresh
    },
  })
}

