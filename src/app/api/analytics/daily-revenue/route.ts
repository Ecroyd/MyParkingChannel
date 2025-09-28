import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';
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

    const supabase = getServerSupabase();

    // Verify user has access to this tenant
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (!userTenant) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { data, error } = await supabase.rpc("analytics_daily_revenue", {
      p_tenant_id: tenantId,
      p_start: start,
      p_end: end,
    });

    if (error) {
      console.error("Daily analytics error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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
