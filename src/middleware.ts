import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const url = new URL(req.url)
  const host = url.hostname

  // Enhanced logging for debugging
  console.log('[MW] Processing request:', {
    host,
    pathname: req.nextUrl.pathname,
    userAgent: req.headers.get('user-agent')?.substring(0, 50),
    timestamp: new Date().toISOString()
  })

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
    url.pathname.startsWith('/manifest') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fallback-') ||
    url.pathname.startsWith('/file.svg') ||
    url.pathname.startsWith('/globe.svg') ||
    url.pathname.startsWith('/logo.svg') ||
    url.pathname.startsWith('/vercel.svg') ||
    url.pathname.startsWith('/window.svg') ||
    url.pathname.startsWith('/next.svg') ||
    url.pathname.startsWith('/marker-') ||
    url.pathname.startsWith('/images/')
  ) {
    console.log('[MW] Skipping middleware for:', host, url.pathname)
    return NextResponse.next()
  }

  // Check if this is a subdomain of the base domain
  const baseDomain = process.env.NEXT_PUBLIC_APP_BASE_DOMAIN
  if (baseDomain && host.endsWith(baseDomain) && host !== baseDomain) {
    const slug = host.replace(`.${baseDomain}`, '')
    const newUrl = new URL(req.url)
    newUrl.pathname = `/sites/${slug}${url.pathname}`
    
    console.log('[MW] Subdomain rewrite:', {
      from: req.url,
      to: newUrl.toString(),
      slug,
      baseDomain
    })
    
    return NextResponse.rewrite(newUrl)
  }

  // For custom domains, rewrite to the site/[domain] route
  // This route will handle the domain resolution and redirect to the correct tenant site
  const newUrl = new URL(req.url)
  newUrl.pathname = `/site/${host}${url.pathname}`
  
  console.log('[MW] Custom domain rewrite:', {
    from: req.url,
    to: newUrl.toString(),
    domain: host,
    originalPath: url.pathname
  })
  
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
