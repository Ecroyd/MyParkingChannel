import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { mapStagingToBookings } from "@/lib/imports/mapToBookings";

export async function POST(req: Request) {
  const { tenantId, runId } = await req.json();
  
  if (!tenantId || !runId) {
    return NextResponse.json({ error: "tenantId and runId required" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  try {
    // Get all staging records for this run
    const { data: stagingRecords, error: fetchError } = await admin
      .from("booking_import_staging")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("run_id", runId);

    if (fetchError) {
      console.error("❌ Failed to fetch staging records:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 400 });
    }

    if (!stagingRecords || stagingRecords.length === 0) {
      return NextResponse.json({ error: "No staging records found" }, { status: 404 });
    }

    // Map staging records to bookings format
    const bookingsData = stagingRecords.map(mapStagingToBookings);

    // Insert into bookings table
    const { error: insertError, count } = await admin
      .from("bookings")
      .insert(bookingsData, { count: "exact" });

    if (insertError) {
      console.error("❌ Failed to insert bookings:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    // Delete staging records after successful insert
    const { error: deleteError } = await admin
      .from("booking_import_staging")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("run_id", runId);

    if (deleteError) {
      console.error("❌ Failed to delete staging records:", deleteError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({ 
      ok: true, 
      inserted: count || bookingsData.length,
      message: `Successfully imported ${count || bookingsData.length} bookings`
    });

  } catch (error: any) {
    console.error("❌ Finalize error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
