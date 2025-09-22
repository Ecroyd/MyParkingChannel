import { NextResponse } from 'next/server'
import { mapCsvRowToBooking } from '@/lib/csv/normalise'

export async function POST(req: Request) {
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

