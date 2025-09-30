import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!tenantId || !start || !end) {
      return NextResponse.json(
        { error: "Missing required parameters: tenantId, start, end" },
        { status: 400 }
      );
    }

    const supabase = await getServerSupabase();
    const adminSupabase = await createAdminClient();

    // Verify user has access to this tenant
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userTenant } = await adminSupabase
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (!userTenant) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Query data directly instead of using functions with tenant access control
    console.log('🔍 Analytics Summary: Querying bookings directly for tenant:', tenantId);
    
    const { data: bookings, error } = await adminSupabase
      .from('bookings')
      .select('money_received, start_at')
      .eq('tenant_id', tenantId)
      .gte('start_at', `${start}T00:00:00.000Z`)
      .lt('start_at', `${end}T23:59:59.999Z`);

    if (error) {
      console.error("❌ Analytics Summary Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Process the data to match the expected format
    const totalBookings = bookings?.length || 0;
    const totalRevenue = bookings?.reduce((sum, booking) => sum + (booking.money_received || 0), 0) || 0;
    const extensionRevenue = 0; // No extension_revenue column exists
    const avgDailyRevenue = totalBookings > 0 ? totalRevenue / Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24)) : 0;
    
    const data = [{
      total_bookings: totalBookings,
      total_revenue: totalRevenue + extensionRevenue,
      avg_daily_revenue: avgDailyRevenue,
      peak_occupancy_rate: 0, // Would need capacity data to calculate
      total_extensions: 0, // No extension data available
      extension_revenue: extensionRevenue
    }];

    console.log('✅ Analytics Summary Success:', data);

    return NextResponse.json({ data: data?.[0] || {} });
  } catch (error: any) {
    console.error("Summary analytics error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
