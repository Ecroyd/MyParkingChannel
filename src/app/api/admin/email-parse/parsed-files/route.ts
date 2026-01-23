import { createAdminClient } from "@/lib/supabase/server-admin";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Reuse the email-to-tenant mapping logic
function getEmailTenantMap(): Record<string, string> {
  if (process.env.EMAIL_TENANT_MAP) {
    try {
      return JSON.parse(process.env.EMAIL_TENANT_MAP);
    } catch (e) {
      console.error("[PARSED FILES] Invalid EMAIL_TENANT_MAP JSON:", e);
    }
  }
  
  return {
    "jcecroyd@gmail.com": "bab45dab-19e8-4230-b18e-ee1f663608e5",
    "info@flyparksexeter.co.uk": "bab45dab-19e8-4230-b18e-ee1f663608e5",
    "eek_me@hotmail.com": "bab45dab-19e8-4230-b18e-ee1f663608e5",
  };
}

function detectTenantFromEmail(email: { from_address?: string | null }): string | null {
  if (!email.from_address) return null;
  
  const map = getEmailTenantMap();
  const from = email.from_address.toLowerCase().trim();
  
  if (map[from]) return map[from];
  
  const domain = from.split("@")[1];
  if (domain && map[domain]) return map[domain];
  
  return null;
}

/**
 * Get parsed files with source verification
 */
export async function GET() {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "No tenant context" }, { status: 401 });
    }

    const adminClient = await createAdminClient();

    // Get parsed files from last 7 days
    const { data: allParsedFiles, error: parsedError } = await adminClient
      .from("ingest_email_files")
      .select(`
        id,
        filename,
        parse_status,
        parsed_at,
        created_at,
        ingest_emails!inner(
          id,
          from_address,
          subject,
          created_at
        )
      `)
      .eq("parse_status", "parsed")
      .gte("parsed_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("parsed_at", { ascending: false })
      .limit(100);

    if (parsedError) {
      console.error("[PARSED FILES] Error fetching files:", parsedError);
      return NextResponse.json({ ok: false, error: parsedError.message }, { status: 500 });
    }

    // Filter by tenant
    const parsedFiles = (allParsedFiles || []).filter((file: any) => {
      const email = file.ingest_emails;
      const fileTenantId = detectTenantFromEmail(email);
      return fileTenantId === ctx.tenantId;
    });

    // Get source info for each file
    const filesWithSource: any[] = [];
    for (const file of parsedFiles) {
      const emailId = (file.ingest_emails as any).id;

      // Get channel from staging
      const { data: stagingRow } = await adminClient
        .from("booking_import_staging")
        .select("raw_json, source")
        .eq("source_email_id", emailId)
        .eq("source_filename", file.filename)
        .limit(1)
        .maybeSingle();

      // Get source from bookings
      const { data: bookingRow } = await adminClient
        .from("bookings")
        .select("source, external_source")
        .eq("tenant_id", ctx.tenantId)
        .gte("created_at", new Date(file.parsed_at || file.created_at).toISOString())
        .limit(1)
        .maybeSingle();

      // Count bookings
      const { count: bookingCount } = await adminClient
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId)
        .gte("created_at", new Date(file.parsed_at || file.created_at).toISOString());

      filesWithSource.push({
        file_id: file.id,
        filename: file.filename,
        parse_status: file.parse_status,
        parsed_at: file.parsed_at,
        file_created: file.created_at,
        from_address: (file.ingest_emails as any).from_address,
        subject: (file.ingest_emails as any).subject,
        email_received: (file.ingest_emails as any).created_at,
        detected_channel: stagingRow?.raw_json?.channel || null,
        staging_source: stagingRow?.source || null,
        booking_external_source: bookingRow?.external_source || null,
        booking_source: bookingRow?.source || null,
        bookings_created: bookingCount || 0,
      });
    }

    // Get recent bookings with source trace
    const { data: recentBookings, error: bookingsError } = await adminClient
      .from("bookings")
      .select(`
        id,
        reference,
        customer_name,
        plate,
        start_at,
        end_at,
        money_charged,
        source,
        external_source,
        created_at
      `)
      .eq("tenant_id", ctx.tenantId)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(20);

    // For each booking, get source file info
    const bookingsWithSource: any[] = [];
    if (recentBookings) {
      for (const booking of recentBookings) {
        // Find staging row for this booking
        const { data: stagingRow } = await adminClient
          .from("booking_import_staging")
          .select("source_email_id, source_filename, raw_json")
          .eq("tenant_id", ctx.tenantId)
          .eq("reference", booking.reference)
          .eq("vehicle_reg", booking.plate)
          .limit(1)
          .maybeSingle();

        if (stagingRow) {
          // Get file info
          const { data: fileRow } = await adminClient
            .from("ingest_email_files")
            .select("filename, parsed_at")
            .eq("email_id", stagingRow.source_email_id)
            .eq("filename", stagingRow.source_filename)
            .limit(1)
            .maybeSingle();

          // Get email info
          const { data: emailRow } = await adminClient
            .from("ingest_emails")
            .select("from_address")
            .eq("id", stagingRow.source_email_id)
            .limit(1)
            .maybeSingle();

          // Verify source
          const channel = stagingRow.raw_json?.channel;
          let verification = '✅ Correct';
          if (channel === 'CAVU' && (booking.source !== 'cavu' || booking.external_source !== 'CAVU Email Import')) {
            verification = `⚠️ CAVU file tagged as ${booking.source}/${booking.external_source}`;
          } else if (channel === 'HOLIDAY_EXTRAS' && (booking.source !== 'holidayextras' || booking.external_source !== 'Holiday Extras Email Import')) {
            verification = `⚠️ Holiday Extras tagged as ${booking.source}/${booking.external_source}`;
          } else if (channel === 'APH' && booking.external_source !== 'APH Email Import') {
            verification = `⚠️ APH file tagged as ${booking.external_source}`;
          } else if (channel === 'FLYPARKS_EMAIL' && booking.external_source !== 'Flyparks Email Import') {
            verification = `⚠️ Flyparks tagged as ${booking.external_source}`;
          }

          bookingsWithSource.push({
            booking_id: booking.id,
            reference: booking.reference,
            customer_name: booking.customer_name,
            plate: booking.plate,
            start_at: booking.start_at,
            end_at: booking.end_at,
            money_charged: booking.money_charged,
            source: booking.source,
            external_source: booking.external_source,
            booking_created: booking.created_at,
            source_file: fileRow?.filename || 'Unknown',
            file_parsed_at: fileRow?.parsed_at || null,
            email_from: emailRow?.from_address || 'Unknown',
            detected_channel: channel || null,
            verification,
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      files: filesWithSource,
      bookings: bookingsWithSource,
    });
  } catch (err: any) {
    console.error("[PARSED FILES] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
