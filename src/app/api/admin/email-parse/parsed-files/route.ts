import { createAdminClient } from "@/lib/supabase/server-admin";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_VERSION = "parsed-files-v3-staging-join-emailid-filename";

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

function bookingSourceFromParserKey(parserKey: string | null): string | null {
  switch (parserKey) {
    case "aph_email_import":
      return "aph";
    case "cavu_email_import":
      return "cavu";
    case "holiday_extras_email_import":
      return "holidayextras";
    case "flyparks_email_import":
      return "direct";
    default:
      return null;
  }
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

    // Single source of truth query using ingest_email_files for attribution
    // Use direct query - ingest_email_files is the authoritative source
    const { data: queryResult, error: queryError } = await adminClient
        .from("ingest_email_files")
        .select(`
          id,
          filename,
          parse_status,
          parsed_at,
          created_at,
          parser_key,
          detected_source,
          external_source,
          attribution_confidence,
          email_id,
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

      if (queryError) {
        console.error("[PARSED FILES] Error fetching files:", queryError);
        return NextResponse.json({ ok: false, error: queryError.message }, { status: 500 });
      }

      // Filter by tenant and enrich with staging data
      const filesWithSource: any[] = [];
      for (const file of queryResult || []) {
        // ingest_emails!inner returns a single object, but TypeScript may infer as array
        const email = Array.isArray(file.ingest_emails) 
          ? file.ingest_emails[0] 
          : (file.ingest_emails as any);
        
        if (!email || typeof email !== 'object') continue;
        
        const fileTenantId = detectTenantFromEmail(email as { from_address?: string | null });
        if (fileTenantId !== ctx.tenantId) continue;

        const emailId = (email as any).id;

        // Get staging data (bookings count and sample references) - single source of truth
        const { data: stagingData, count: stagingCount } = await adminClient
          .from("booking_import_staging")
          .select("reference, raw_json", { count: "exact" })
          .eq("source_email_id", emailId)
          .eq("source_filename", file.filename);

        const stagingChannel = stagingData?.[0]?.raw_json?.channel || null;
        const sampleReferences = stagingData
          ? Array.from(new Set(stagingData.map((s: any) => s.reference).filter(Boolean))).slice(0, 5)
          : [];

        // Determine expected parser key from detected_source or staging channel
        const detectedSource = file.detected_source || stagingChannel;
        let expectedParserKey: string | null = null;
        if (detectedSource === 'APH') {
          expectedParserKey = 'aph_email_import';
        } else if (detectedSource === 'CAVU') {
          expectedParserKey = 'cavu_email_import';
        } else if (detectedSource === 'HOLIDAY_EXTRAS') {
          expectedParserKey = 'holiday_extras_email_import';
        } else if (detectedSource === 'FLYPARKS_EMAIL') {
          expectedParserKey = 'flyparks_email_import';
        }

        // Determine if there's a source issue (only flag real mismatches)
        const hasSourceIssue = expectedParserKey !== null && 
          (file.parser_key === null || file.parser_key !== expectedParserKey);

        // Map parser_key to booking source for display (single source of truth)
        const bookingSource = bookingSourceFromParserKey(file.parser_key);

        filesWithSource.push({
          file_id: file.id,
          filename: file.filename,
          parse_status: file.parse_status,
          parsed_at: file.parsed_at,
          file_created: file.created_at,
          from_address: (email as any).from_address, // From ingest_emails (correct)
          subject: (email as any).subject,
          email_received: (email as any).created_at,
          detected_channel: detectedSource,
          parser_key: file.parser_key,
          external_source: file.external_source,
          attribution_confidence: file.attribution_confidence,
          booking_source: bookingSource, // From parser_key mapping (single source of truth)
          booking_external_source: file.external_source, // From ingest_email_files (single source of truth)
          bookings_created: stagingCount || 0, // From staging (correct)
          sample_references: sampleReferences, // From staging (correct)
          has_source_issue: hasSourceIssue,
          // Debug fields
          debug_file_parser_key: file.parser_key,
          debug_file_external_source: file.external_source,
          debug_stg_rows: stagingCount || 0,
          debug_stg_refs_first5: sampleReferences,
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

    return NextResponse.json(
      {
        ok: true,
        api_version: API_VERSION,
        files: filesWithSource,
        bookings: bookingsWithSource,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (err: any) {
    console.error("[PARSED FILES] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
