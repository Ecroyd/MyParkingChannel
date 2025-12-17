// GET /api/admin/anpr/known-vehicles.csv
// CSV export of known vehicles for ANPR vendor import (active bookings + exemptions)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
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
      return NextResponse.json({ error: 'Access denied. Admin role required.' }, { status: 403 });
    }

    // Get tenant timezone
    const { data: tenant } = await adminClient
      .from('tenants')
      .select('timezone')
      .eq('id', tenantId)
      .single();

    const timezone = tenant?.timezone || 'Europe/London';

    // Calculate today and tomorrow in tenant timezone
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    // Convert to UTC for database queries
    // Note: This is a simplified conversion. For production, use proper timezone library
    const todayUTC = new Date(today.toISOString());
    const dayAfterTomorrowUTC = new Date(dayAfterTomorrow.toISOString());

    // 1) Get active bookings for today and tomorrow
    const { data: bookings, error: bookingsError } = await adminClient
      .from('bookings')
      .select('plate, start_at, end_at, reference, customer_name')
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .not('plate', 'is', null)
      .gte('start_at', todayUTC.toISOString())
      .lt('start_at', dayAfterTomorrowUTC.toISOString())
      .order('start_at', { ascending: true });

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return NextResponse.json(
        { error: 'Failed to fetch bookings' },
        { status: 500 }
      );
    }

    // 2) Get exemptions if table exists (with valid_from/to)
    let exemptions: any[] = [];
    try {
      const { data: exemptionsData, error: exemptionsError } = await adminClient
        .from('exemptions')
        .select('vehicle_reg, valid_from, valid_to, exemption_type')
        .eq('tenant_id', tenantId)
        .not('vehicle_reg', 'is', null)
        .lte('valid_from', dayAfterTomorrowUTC.toISOString())
        .or(`valid_to.is.null,valid_to.gte.${todayUTC.toISOString()}`);

      if (!exemptionsError && exemptionsData) {
        exemptions = exemptionsData;
      }
    } catch (err) {
      // exemptions table might not exist - that's okay
      console.log('Exemptions table not available or error:', err);
    }

    // 3) Build CSV content
    const csvRows: string[] = [];
    
    // CSV header
    csvRows.push('plate,valid_from,valid_to,reference,name');

    // Add bookings
    for (const booking of bookings || []) {
      if (!booking.plate) continue;
      
      const plate = booking.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const validFrom = booking.start_at ? new Date(booking.start_at).toISOString() : '';
      const validTo = booking.end_at ? new Date(booking.end_at).toISOString() : '';
      const reference = booking.reference || '';
      const name = booking.customer_name || '';

      csvRows.push(
        `"${plate}","${validFrom}","${validTo}","${reference}","${name}"`
      );
    }

    // Add exemptions
    for (const exemption of exemptions) {
      if (!exemption.vehicle_reg) continue;
      
      const plate = exemption.vehicle_reg.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const validFrom = exemption.valid_from ? new Date(exemption.valid_from).toISOString() : '';
      const validTo = exemption.valid_to ? new Date(exemption.valid_to).toISOString() : '';
      const reference = exemption.exemption_type || '';
      const name = '';

      csvRows.push(
        `"${plate}","${validFrom}","${validTo}","${reference}","${name}"`
      );
    }

    const csvContent = csvRows.join('\n');

    // 4) Return CSV response
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="known-vehicles-${tenantId}-${today.toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Known vehicles CSV export error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
