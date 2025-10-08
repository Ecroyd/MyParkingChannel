import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'

export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEBUG_SITE !== '1') {
    return new NextResponse('Not Found', { status: 404 })
  }

  try {
    const url = new URL(req.url)
    const host = req.headers.get('host') || ''
    const testDomain = url.searchParams.get('domain') || host

    console.log('[DEBUG] Testing middleware logic for domain:', testDomain)

    // Simulate the middleware logic
    const supabaseAdmin = createAdminClient()
    const { data: domainRecord, error } = await supabaseAdmin
      .from('tenant_domains')
      .select('tenant_id, tenants(slug)')
      .eq('domain', testDomain)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ 
        error: error.message,
        domain: testDomain,
        found: false 
      })
    }

    if (domainRecord?.tenants && Array.isArray(domainRecord.tenants) && domainRecord.tenants.length > 0) {
      const tenant = domainRecord.tenants[0]
      const rewritePath = `/sites/${tenant.slug}${url.pathname}`
      return NextResponse.json({
        domain: testDomain,
        found: true,
        tenantId: domainRecord.tenant_id,
        tenantSlug: tenant.slug,
        rewritePath,
        message: `Domain ${testDomain} would be rewritten to ${rewritePath}`
      })
    }

    return NextResponse.json({
      domain: testDomain,
      found: false,
      message: `No tenant found for domain ${testDomain}`
    })

  } catch (error: any) {
    console.error('[DEBUG] Middleware test error:', error)
    return NextResponse.json({ 
      error: error.message,
      domain: req.headers.get('host') || 'unknown'
    }, { status: 500 })
  }
}
