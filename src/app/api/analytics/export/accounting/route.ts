import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';
import { requireFinancialsAccess } from '@/lib/auth/requireFinancials';
import { stringify } from "csv-stringify/sync";
import { createAdminClient } from '@/lib/supabase/server-admin';
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/datetime/parse';
import {
  exportChannel,
  exportDateRangeUtcBounds,
  exportStayDays,
  formatExportDateTime,
  money2,
} from '@/lib/analytics/accountingExportFormat';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId")!;
  const start = searchParams.get("start")!;
  const end = searchParams.get("end")!;

  if (!tenantId || !start || !end) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  const guard = await requireFinancialsAccess(tenantId);
  if (!guard.ok) return guard.response;

  const supabase = await getServerSupabase();
  const adminClient = createAdminClient();

  try {
    const { data: tenantRow } = await adminClient
      .from('tenants')
      .select('timezone')
      .eq('id', tenantId)
      .maybeSingle();
    const timezone = tenantRow?.timezone || DEFAULT_TENANT_TIMEZONE;
    const { fromUtc, toUtcExclusive } = exportDateRangeUtcBounds(start, end, timezone);

    // Get all bookings with their extensions for the date range
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select(`
        id,
        reference,
        start_at,
        end_at,
        money_charged,
        money_received,
        source,
        external_source,
        status,
        created_at
      `)
      .eq("tenant_id", tenantId)
      .gte("start_at", fromUtc)
      .lt("start_at", toUtcExclusive)
      .order("start_at", { ascending: true });

    if (bookingsError) {
      console.error("Bookings query error:", bookingsError);
      return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
    }

    // Get all extensions for the same date range
    const { data: extensions, error: extensionsError } = await supabase
      .from("booking_extensions")
      .select(`
        booking_id,
        charged_amount_cents,
        stripe_payment_status,
        created_at
      `)
      .eq("tenant_id", tenantId)
      .gte("created_at", start)
      .lt("created_at", end)
      .eq("stripe_payment_status", "succeeded");

    if (extensionsError) {
      console.error("Extensions query error:", extensionsError);
      return NextResponse.json({ error: "Failed to fetch extensions" }, { status: 500 });
    }

    // Create a map of extensions by booking_id
    const extensionsByBooking = new Map();
    extensions?.forEach((ext: any) => {
      if (!extensionsByBooking.has(ext.booking_id)) {
        extensionsByBooking.set(ext.booking_id, []);
      }
      extensionsByBooking.get(ext.booking_id).push(ext);
    });

    // Prepare CSV data
    const csvData = [];

    // Add header row
    csvData.push([
      "Date",
      "Booking Reference",
      "Start",
      "End",
      "Days",
      "Channel",
      "Status",
      "Money Charged (£)",
      "Money Received (£)",
      "Extension Amount (£)",
      "Total Revenue (£)",
      "Created",
    ]);

    // Process each booking
    bookings?.forEach((booking: any) => {
      const bookingExtensions = extensionsByBooking.get(booking.id) || [];
      const totalExtensionAmount = bookingExtensions.reduce((sum: number, ext: any) =>
        sum + (ext.charged_amount_cents / 100), 0
      );

      const startLocal = formatExportDateTime(booking.start_at, timezone);
      const endLocal = formatExportDateTime(booking.end_at, timezone);
      const createdLocal = formatExportDateTime(booking.created_at, timezone);
      const days = exportStayDays(booking.start_at, booking.end_at, timezone);
      const totalRevenue = (booking.money_charged || 0) + totalExtensionAmount;

      csvData.push([
        startLocal.slice(0, 10), // DD/MM/YYYY
        booking.reference || "",
        startLocal,
        endLocal,
        String(days),
        exportChannel(booking),
        booking.status || "",
        money2(booking.money_charged),
        money2(booking.money_received),
        money2(totalExtensionAmount),
        money2(totalRevenue),
        createdLocal,
      ]);
    });

    // Generate CSV (BOM for Excel)
    const csv = `\uFEFF${stringify(csvData, {
      header: false,
      delimiter: ',',
    })}`;

    const filename = `accounting-export-${start}-to-${end}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error("Accounting export error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
