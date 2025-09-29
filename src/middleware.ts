import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEBUG_SITE === '1') {
    console.log('[MW]', {
      host: req.headers.get('host') || '',
      pathname: req.nextUrl.pathname,
    })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api/debug).*)'],
}
