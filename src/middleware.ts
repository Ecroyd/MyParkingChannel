import { NextResponse, type NextRequest } from 'next/server'

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

  // For Edge Runtime compatibility, we'll use a different approach
  // Instead of direct Supabase calls in middleware, we'll use the existing
  // tenant resolution logic that's already working in the app
  
  // Check if this is a subdomain of the base domain
  const baseDomain = process.env.NEXT_PUBLIC_APP_BASE_DOMAIN
  if (baseDomain && host.endsWith(baseDomain) && host !== baseDomain) {
    const slug = host.replace(`.${baseDomain}`, '')
    const newUrl = new URL(req.url)
    newUrl.pathname = `/sites/${slug}${url.pathname}`
    
    if (process.env.NEXT_PUBLIC_DEBUG_SITE === '1') {
      console.log('[MW] Subdomain rewrite:', {
        from: req.url,
        to: newUrl.toString(),
        slug
      })
    }
    
    return NextResponse.rewrite(newUrl)
  }

  // For custom domains, rewrite to the site/[domain] route
  // This route will handle the domain resolution and redirect to the correct tenant site
  const newUrl = new URL(req.url)
  newUrl.pathname = `/site/${host}${url.pathname}`
  
  if (process.env.NEXT_PUBLIC_DEBUG_SITE === '1') {
    console.log('[MW] Custom domain rewrite:', {
      from: req.url,
      to: newUrl.toString(),
      domain: host
    })
  }
  
  return NextResponse.rewrite(newUrl)
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
