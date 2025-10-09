import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    console.log('🔍 Testing Supabase connection...')
    
    // Test environment variables
    const envCheck = {
      SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'NOT SET',
      SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET'
    }
    
    console.log('🔍 Environment check:', envCheck)
    
    // Test admin client creation
    let adminClient = null
    let adminError = null
    try {
      adminClient = createAdminClient()
      console.log('✅ Admin client created successfully')
    } catch (error) {
      adminError = error
      console.error('❌ Admin client creation failed:', error)
    }
    
    // Test database query
    let queryResult = null
    let queryError = null
    if (adminClient) {
      try {
        const { data, error } = await adminClient
          .from('tenants')
          .select('id, slug, name')
          .eq('slug', 'flyparksexeter')
          .maybeSingle()
        
        queryResult = data
        queryError = error
        console.log('🔍 Query result:', { data, error })
      } catch (error) {
        queryError = error
        console.error('❌ Query failed:', error)
      }
    }
    
    return NextResponse.json({
      success: true,
      environment: envCheck,
      adminClient: adminClient ? 'CREATED' : 'FAILED',
      adminError: adminError?.message || null,
      queryResult,
      queryError: queryError?.message || null,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('❌ Supabase test error:', error)
    return NextResponse.json({ 
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
