// GET /api/admin/bookings/search - Search bookings for a tenant
// Authenticated via user session (admin/owner role required)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const q = searchParams.get('q');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    if (!q || q.trim().length < 2) {
      return NextResponse.json({ bookings: [] });
    }

    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify user has admin access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!userTenant || (userTenant.role !== 'admin' && userTenant.role !== 'owner')) {
      return NextResponse.json(
        { error: 'Access denied. Admin role required.' },
        { status: 403 }
      );
    }

    // Search bookings by reference, customer name, email, or plate
    const searchTerm = q.trim();
    const { data: bookings, error } = await adminClient
      .from('bookings')
      .select('id, reference, customer_name, customer_email, plate, start_at, end_at')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .or(
        `reference.ilike.%${searchTerm}%,customer_name.ilike.%${searchTerm}%,customer_email.ilike.%${searchTerm}%,plate.ilike.%${searchTerm}%`
      )
      .order('start_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[Bookings Search] Error:', error);
      return NextResponse.json(
        { error: 'Failed to search bookings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ bookings: bookings || [] });
  } catch (error: any) {
    console.error('[Bookings Search] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

