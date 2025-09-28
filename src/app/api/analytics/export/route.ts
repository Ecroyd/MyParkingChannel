import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start') ?? ''
  const end   = searchParams.get('end')   ?? ''
  const tz    = searchParams.get('tz')    ?? 'Europe/London'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  const supabase = await getServerSupabase()

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
      // Cookie refresh is handled automatically by the server client
    },
  })
}

