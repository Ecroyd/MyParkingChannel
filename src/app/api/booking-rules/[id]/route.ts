import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { updateBookingRuleSchema } from '@/lib/validation/booking-rules'

// GET /api/booking-rules/[id] - Get a specific booking rule
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getServerSupabase()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's tenant
    const { data: userTenant, error: tenantError } = await supabase
      .from('user_tenants')
      .select(`
        tenant_id,
        role,
        tenants (
          id,
          name,
          slug,
          timezone
        )
      `)
      .eq('user_id', user.id)
      .single()

    if (tenantError || !userTenant?.tenants) {
      return NextResponse.json({ error: 'No tenant found for user' }, { status: 404 })
    }

    const tenant = userTenant.tenants
  
    const { data, error } = await supabase
      .from('booking_rules')
      .select('*')
      .eq('id', params.id)
      .eq('tenant_id', tenant.id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('GET /api/booking-rules/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/booking-rules/[id] - Update a booking rule
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getServerSupabase()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's tenant
    const { data: userTenant, error: tenantError } = await supabase
      .from('user_tenants')
      .select(`
        tenant_id,
        role,
        tenants (
          id,
          name,
          slug,
          timezone
        )
      `)
      .eq('user_id', user.id)
      .single()

    if (tenantError || !userTenant?.tenants) {
      return NextResponse.json({ error: 'No tenant found for user' }, { status: 404 })
    }

    const tenant = userTenant.tenants
  
    const body = await req.json()
    
    // Validate the request body
    const validation = updateBookingRuleSchema.safeParse(body)
    
    if (!validation.success) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: validation.error.errors 
      }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('booking_rules')
      .update(validation.data)
      .eq('id', params.id)
      .eq('tenant_id', tenant.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('PUT /api/booking-rules/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/booking-rules/[id] - Delete a booking rule
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getServerSupabase()
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's tenant
    const { data: userTenant, error: tenantError } = await supabase
      .from('user_tenants')
      .select(`
        tenant_id,
        role,
        tenants (
          id,
          name,
          slug,
          timezone
        )
      `)
      .eq('user_id', user.id)
      .single()

    if (tenantError || !userTenant?.tenants) {
      return NextResponse.json({ error: 'No tenant found for user' }, { status: 404 })
    }

    const tenant = userTenant.tenants
  
    const { error } = await supabase
      .from('booking_rules')
      .delete()
      .eq('id', params.id)
      .eq('tenant_id', tenant.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE /api/booking-rules/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
