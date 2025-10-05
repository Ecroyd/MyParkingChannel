import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase, createAdminClient } from '@/lib/supabase/server'
import { createBookingRuleSchema, updateBookingRuleSchema } from '@/lib/validation/booking-rules'

// GET /api/booking-rules - List all booking rules for the tenant
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's tenants using admin client to bypass RLS
    const adminSupabase = await createAdminClient();
    const { data: userTenants, error: tenantError } = await adminSupabase
      .from('user_tenants')
      .select(`
        tenant_id,
        role,
        is_default,
        tenants (
          id,
          name,
          slug,
          timezone
        )
      `)
      .eq('user_id', user.id)

    if (tenantError) {
      return NextResponse.json({ error: 'Error loading tenant data' }, { status: 400 })
    }

    if (!userTenants || userTenants.length === 0) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 404 })
    }

    // Find the default tenant or use the first one
    const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0]
    const tenant = userTenant?.tenants

    // Get booking rules for the tenant
    const { data, error } = await supabase
      .from('booking_rules')
      .select('*')
      .eq('tenant_id', (tenant as any).id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    console.error('GET /api/booking-rules error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/booking-rules - Create a new booking rule
export async function POST(req: NextRequest) {
  try {
    console.log('POST /api/booking-rules called')
    
    const supabase = await getServerSupabase()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    console.log('User:', user.id)

    // Get user's tenants using admin client to bypass RLS
    const adminSupabase = await createAdminClient();
    const { data: userTenants, error: tenantError } = await adminSupabase
      .from('user_tenants')
      .select(`
        tenant_id,
        role,
        is_default,
        tenants (
          id,
          name,
          slug,
          timezone
        )
      `)
      .eq('user_id', user.id)

    if (tenantError) {
      console.log('Error loading tenant data:', tenantError)
      return NextResponse.json({ error: 'Error loading tenant data' }, { status: 400 })
    }

    if (!userTenants || userTenants.length === 0) {
      console.log('No tenant access found for user')
      return NextResponse.json({ error: 'No tenant access found' }, { status: 404 })
    }

    // Find the default tenant or use the first one
    const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0]
    const tenant = userTenant?.tenants
    console.log('Tenant:', tenant)
    
    const body = await req.json()
    console.log('Received request body:', body)
    console.log('Tenant ID:', (tenant as any).id)
    
    // Validate the request body
    const validation = createBookingRuleSchema.safeParse({
      ...body,
      tenant_id: (tenant as any).id
    })
    
    if (!validation.success) {
      console.log('Validation failed:', validation.error.errors)
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: validation.error.errors 
      }, { status: 400 })
    }

    console.log('Validated data:', validation.data)

    const { data, error } = await supabase
      .from('booking_rules')
      .insert(validation.data)
      .select()
      .single()

    if (error) {
      console.log('Database error:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    console.log('Successfully created rule:', data)
    return NextResponse.json({ data })
  } catch (error) {
    console.log('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
