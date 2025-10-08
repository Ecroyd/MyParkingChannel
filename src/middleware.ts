import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'

export async function middleware(req: NextRequest) {
  const url = new URL(req.url)
  const host = url.hostname

  if (process.env.NEXT_PUBLIC_DEBUG_SITE === '1') {
    console.log('[MW]', {
      host,
      pathname: req.nextUrl.pathname,
    })
  }

  // Ignore admin routes, assets, API routes, and main app domain
  if (
    host.includes('myparkingchannel.app') || 
    host.startsWith('admin') ||
    host.startsWith('localhost') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/favicon.ico') ||
    url.pathname.startsWith('/sw.js') ||
    url.pathname.startsWith('/workbox-') ||
    url.pathname.startsWith('/manifest')
  ) {
    return NextResponse.next()
  }

  try {
    // Look up domain in Supabase
    const supabaseAdmin = createAdminClient()
    const { data: domainRecord } = await supabaseAdmin
      .from('tenant_domains')
      .select('tenant_id, tenants(slug)')
      .eq('domain', host)
      .maybeSingle()

    if (domainRecord?.tenants?.slug) {
      // Re-route to tenant site dynamically
      const newUrl = new URL(req.url)
      newUrl.pathname = `/sites/${domainRecord.tenants.slug}${url.pathname}`
      
      if (process.env.NEXT_PUBLIC_DEBUG_SITE === '1') {
        console.log('[MW] Rewriting:', {
          from: req.url,
          to: newUrl.toString(),
          tenantSlug: domainRecord.tenants.slug
        })
      }
      
      return NextResponse.rewrite(newUrl)
    }

    return NextResponse.next()
  } catch (error) {
    console.error('[MW] Error in middleware:', error)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sw.js (service worker)
     * - workbox- (workbox files)
     * - manifest (PWA manifest)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sw.js|workbox-|manifest).*)',
  ],
}
