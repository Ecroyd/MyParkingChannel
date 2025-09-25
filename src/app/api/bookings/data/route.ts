import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user's tenant
    const { data: userTenants, error: userTenantsError } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (userTenantsError || !userTenants?.length) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 403 });
    }

    // Get the default tenant or first tenant
    const defaultTenant = userTenants.find(ut => ut.is_default) || userTenants[0];
    const tenantId = defaultTenant.tenant_id;

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from or to parameters' }, { status: 400 });
    }

    // Fetch bookings using admin client to bypass RLS
    const { data: bookings, error: bookingsError } = await adminClient
      .from('bookings')
      .select('start_at, end_at, source, tenant_id')
      .eq('tenant_id', tenantId)
      .lte('start_at', to)
      .gte('end_at', from)
      .order('start_at', { ascending: true });

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
    }

    return NextResponse.json({ 
      bookings: bookings || [],
      tenantId 
    });

  } catch (error) {
    console.error('Bookings API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
