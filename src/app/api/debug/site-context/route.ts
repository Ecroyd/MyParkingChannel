import { NextRequest, NextResponse } from 'next/server'
import { getSiteContext } from '@/lib/site'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const slug = searchParams.get('slug')
    
    if (!slug) {
      return NextResponse.json({ error: 'Slug parameter is required' }, { status: 400 })
    }

    console.log('🔍 Debug: Checking site context for slug:', slug)
    
    // Test the getSiteContext function
    const siteContext = await getSiteContext(slug)
    
    console.log('🔍 Site context result:', siteContext)

    if (!siteContext) {
      return NextResponse.json({
        slug,
        found: false,
        message: 'Site context not found - tenant may not be published or profile not active'
      })
    }

    return NextResponse.json({
      slug,
      found: true,
      siteContext: {
        tenant: {
          id: siteContext.tenant.id,
          slug: siteContext.tenant.slug,
          name: siteContext.tenant.name,
          status: siteContext.tenant.status
        },
        branding: siteContext.branding
      }
    })

  } catch (error: any) {
    console.error('❌ Debug site-context API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
