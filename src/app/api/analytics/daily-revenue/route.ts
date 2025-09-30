import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { stringify } from "csv-stringify/sync";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const format = searchParams.get("format") || "json";

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
    console.log('🔍 Analytics Daily Revenue: Querying bookings directly for tenant:', tenantId);
    
    const { data: bookings, error } = await adminSupabase
      .from('bookings')
      .select('money_received, extension_revenue, start_at')
      .eq('tenant_id', tenantId)
      .gte('start_at', `${start}T00:00:00.000Z`)
      .lt('start_at', `${end}T23:59:59.999Z`);

    if (error) {
      console.error("❌ Analytics Daily Revenue Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Process the data to match the expected format
    const dailyData = new Map();
    
    bookings?.forEach(booking => {
      const date = booking.start_at.split('T')[0]; // Extract date part
      if (!dailyData.has(date)) {
        dailyData.set(date, {
          date,
          bookings_count: 0,
          booking_revenue: 0,
          extension_revenue: 0,
          total_revenue: 0,
          occupancy_rate: 0
        });
      }
      
      const data = dailyData.get(date);
      data.bookings_count++;
      data.booking_revenue += booking.money_received || 0;
      data.extension_revenue += booking.extension_revenue || 0;
      data.total_revenue = data.booking_revenue + data.extension_revenue;
    });

    const data = Array.from(dailyData.values()).sort((a, b) => a.date.localeCompare(b.date));
    console.log('✅ Analytics Daily Revenue Success:', data);

    if (format === "csv") {
      const csv = stringify(data, { 
        header: true,
        columns: {
          date: 'Date',
          bookings_count: 'Bookings',
          booking_revenue: 'Booking Revenue (£)',
          extension_revenue: 'Extension Revenue (£)',
          total_revenue: 'Total Revenue (£)',
          occupancy_rate: 'Occupancy Rate (%)'
        }
      });
      
      const filename = `daily-revenue-${start}-to-${end}.csv`;
      
      return new NextResponse(csv, {
        headers: { 
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${filename}"`
        },
      });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Daily revenue analytics error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
