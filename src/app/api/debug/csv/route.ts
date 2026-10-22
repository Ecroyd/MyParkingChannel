import { NextResponse } from 'next/server'
import { mapCsvRowToBooking } from '@/lib/csv/normalise'
import { requirePlatformAdminApi } from '@/lib/auth/apiGuards';

export async function POST(req: Request) {
  const guard = await requirePlatformAdminApi();
  if (guard.response) return guard.response;
  try {
    const { testRow } = await req.json()
    
    if (!testRow) {
      return NextResponse.json({ error: 'No test row provided' }, { status: 400 })
    }

    const result = mapCsvRowToBooking(testRow)
    
    return NextResponse.json({
      input: testRow,
      output: result,
      success: true
    })

  } catch (e: any) {
    return NextResponse.json({ 
      error: e?.message ?? 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined
    }, { status: 500 })
  }
}

