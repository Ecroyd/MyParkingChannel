import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';
import { stringify } from "csv-stringify/sync";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId")!;
  const start = searchParams.get("start")!;
  const end = searchParams.get("end")!;

  if (!tenantId || !start || !end) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  const supabase = getServerSupabase();

  try {
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
        status,
        created_at
      `)
      .eq("tenant_id", tenantId)
      .gte("start_at", start)
      .lt("start_at", end)
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
    extensions?.forEach(ext => {
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
      "Start Date",
      "End Date",
      "Channel",
      "Status",
      "Money Charged (£)",
      "Money Received (£)",
      "Extension Amount (£)",
      "Total Revenue (£)",
      "Created Date"
    ]);

    // Process each booking
    bookings?.forEach(booking => {
      const bookingExtensions = extensionsByBooking.get(booking.id) || [];
      const totalExtensionAmount = bookingExtensions.reduce((sum: number, ext: any) =>
        sum + (ext.charged_amount_cents / 100), 0
      );

      // Format dates
      const startDate = new Date(booking.start_at).toLocaleDateString('en-GB');
      const endDate = new Date(booking.end_at).toLocaleDateString('en-GB');
      const createdDate = new Date(booking.created_at).toLocaleDateString('en-GB');
      const bookingDate = new Date(booking.start_at).toLocaleDateString('en-GB');

      // Calculate total revenue (booking + extensions)
      const totalRevenue = (booking.money_charged || 0) + totalExtensionAmount;

      csvData.push([
        bookingDate,
        booking.reference || "",
        startDate,
        endDate,
        booking.source || "unknown",
        booking.status || "",
        (booking.money_charged || 0).toFixed(2),
        (booking.money_received || 0).toFixed(2),
        totalExtensionAmount.toFixed(2),
        totalRevenue.toFixed(2),
        createdDate
      ]);
    });

    // Generate CSV
    const csv = stringify(csvData, { 
      header: false, // We're adding our own header
      delimiter: ','
    });

    // Create filename with date range
    const startDate = new Date(start).toLocaleDateString('en-GB').replace(/\//g, '-');
    const endDate = new Date(end).toLocaleDateString('en-GB').replace(/\//g, '-');
    const filename = `accounting-export-${startDate}-to-${endDate}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error("Accounting export error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
