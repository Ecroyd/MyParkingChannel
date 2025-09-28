import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = getServerSupabase()
    
    // Check if user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ 
        error: 'Not authenticated', 
        userError: userError?.message 
      }, { status: 401 })
    }

    // Check user's tenant
    const { data: userTenant, error: tenantError } = await supabase
      .from('user_tenants')
      .select(`
        tenant_id,
        role,
        tenants (
          id,
          name,
          slug
        )
      `)
      .eq('user_id', user.id)
      .single()

    if (tenantError) {
      return NextResponse.json({ 
        error: 'No tenant found', 
        tenantError: tenantError.message 
      }, { status: 400 })
    }

    // Check if bookings table exists and is accessible
    const { data: bookingsTest, error: bookingsError } = await supabase
      .from('bookings')
      .select('id')
      .limit(1)

    // Try to insert a test booking
    const testBooking = {
      tenant_id: userTenant.tenant_id,
      customer_name: 'Test User',
      customer_email: 'test@example.com',
      plate: 'TEST123',
      reference: 'DEBUG-TEST-' + Date.now(),
      status: 'pending',
      source: 'debug'
    }

    const { data: insertTest, error: insertError } = await supabase
      .from('bookings')
      .insert(testBooking)
      .select()

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email
      },
      tenant: userTenant.tenants,
      userTenant: {
        tenant_id: userTenant.tenant_id,
        role: userTenant.role
      },
      bookingsTable: {
        accessible: !bookingsError,
        error: bookingsError?.message,
        count: bookingsTest?.length || 0
      },
      insertTest: {
        success: !insertError,
        error: insertError?.message,
        data: insertTest
      }
    })

  } catch (e: any) {
    return NextResponse.json({ 
      error: e?.message ?? 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined
    }, { status: 500 })
  }
}

