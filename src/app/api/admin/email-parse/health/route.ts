import { createAdminClient } from "@/lib/supabase/server-admin";
import { getCurrentTenantContext } from "@/lib/auth/tenant-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Reuse the email-to-tenant mapping logic
function getEmailTenantMap(): Record<string, string> {
  if (process.env.EMAIL_TENANT_MAP) {
    try {
      return JSON.parse(process.env.EMAIL_TENANT_MAP);
    } catch (e) {
      console.error("[EMAIL PARSE HEALTH] Invalid EMAIL_TENANT_MAP JSON:", e);
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
  
  // Exact match
  if (map[from]) return map[from];
  
  // Domain match
  const domain = from.split("@")[1];
  if (domain && map[domain]) return map[domain];
  
  return null;
}

/**
 * Check for recent email parsing failures
 * Returns files that failed to parse in the last 24 hours
 */
export async function GET() {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "No tenant context" }, { status: 401 });
    }

    const adminClient = await createAdminClient();

    // Get files that failed to parse in the last 24 hours
    // We'll filter by tenant after fetching by checking email mapping
    const { data: allFailedFiles, error: failedError } = await adminClient
      .from("ingest_email_files")
      .select(`
        id,
        filename,
        parse_status,
        parse_error,
        parsed_at,
        created_at,
        ingest_emails!inner(
          id,
          from_address,
          subject,
          created_at
        )
      `)
      .eq("parse_status", "failed")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    // Filter by tenant (check if email maps to current tenant)
    const failedFiles = (allFailedFiles || []).filter((file: any) => {
      const email = file.ingest_emails;
      const fileTenantId = detectTenantFromEmail(email);
      return fileTenantId === ctx.tenantId;
    }).slice(0, 50);

    if (failedError) {
      console.error("[EMAIL PARSE HEALTH] Error fetching failed files:", failedError);
      return NextResponse.json({ ok: false, error: failedError.message }, { status: 500 });
    }

    // Get files that are still pending (may indicate a stuck parse)
    const { data: allPendingFiles, error: pendingError } = await adminClient
      .from("ingest_email_files")
      .select(`
        id,
        filename,
        parse_status,
        created_at,
        ingest_emails!inner(
          id,
          from_address,
          subject,
          created_at
        )
      `)
      .eq("parse_status", "pending")
      .lt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Older than 1 hour
      .order("created_at", { ascending: false })
      .limit(50);

    // Filter by tenant
    const pendingFiles = (allPendingFiles || []).filter((file: any) => {
      const email = file.ingest_emails;
      const fileTenantId = detectTenantFromEmail(email);
      return fileTenantId === ctx.tenantId;
    }).slice(0, 20);

    if (pendingError) {
      console.error("[EMAIL PARSE HEALTH] Error fetching pending files:", pendingError);
    }

    // Get files that were parsed but resulted in 0 bookings (potential issue)
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
      .gte("parsed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("parsed_at", { ascending: false })
      .limit(100);

    // Filter by tenant
    const parsedFiles = (allParsedFiles || []).filter((file: any) => {
      const email = file.ingest_emails;
      const fileTenantId = detectTenantFromEmail(email);
      return fileTenantId === ctx.tenantId;
    }).slice(0, 50);

    if (parsedError) {
      console.error("[EMAIL PARSE HEALTH] Error fetching parsed files:", parsedError);
    }

    // For parsed files, check if they have staging rows or bookings
    const parsedWithIssues: any[] = [];
    if (parsedFiles) {
      for (const file of parsedFiles) {
        const emailId = (file.ingest_emails as any).id;
        
        // Check staging rows
        const { count: stagingCount } = await adminClient
          .from("booking_import_staging")
          .select("*", { count: "exact", head: true })
          .eq("source_email_id", emailId)
          .eq("source_filename", file.filename);

        // Check bookings
        const { count: bookingCount } = await adminClient
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", ctx.tenantId)
          .gte("created_at", new Date(file.parsed_at || file.created_at).toISOString());

        // If parsed but no bookings created, it's a potential issue
        if ((stagingCount || 0) === 0 && (bookingCount || 0) === 0) {
          parsedWithIssues.push({
            ...file,
            staging_count: stagingCount || 0,
            booking_count: bookingCount || 0,
          });
        }
      }
    }

    const hasFailures = (failedFiles?.length || 0) > 0;
    const hasStuckPending = (pendingFiles?.length || 0) > 0;
    const hasEmptyParses = parsedWithIssues.length > 0;

    return NextResponse.json({
      ok: true,
      hasIssues: hasFailures || hasStuckPending || hasEmptyParses,
      failedFiles: failedFiles || [],
      pendingFiles: pendingFiles || [],
      emptyParsedFiles: parsedWithIssues,
      summary: {
        failedCount: failedFiles?.length || 0,
        stuckPendingCount: pendingFiles?.length || 0,
        emptyParsedCount: parsedWithIssues.length,
      },
    });
  } catch (err: any) {
    console.error("[EMAIL PARSE HEALTH] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
