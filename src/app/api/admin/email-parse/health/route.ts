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
      const matches = fileTenantId === ctx.tenantId;
      if (matches) {
        console.log(`[EMAIL PARSE HEALTH] Failed file ${file.filename} (${file.id}) matches tenant ${ctx.tenantId}`);
      }
      return matches;
    }).slice(0, 50);

    if (failedError) {
      console.error("[EMAIL PARSE HEALTH] Error fetching failed files:", failedError);
      return NextResponse.json({ ok: false, error: failedError.message }, { status: 500 });
    }

    // Get files that are still pending (may indicate a stuck parse)
    // Exclude files that were recently parsed (within last 5 minutes) - they might be in transition
    const { data: allPendingFiles, error: pendingError } = await adminClient
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
      .eq("parse_status", "pending")
      .lt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Older than 1 hour
      .order("created_at", { ascending: false })
      .limit(50);

    // Filter by tenant and exclude files that were recently parsed (might be in transition)
    const pendingFiles = (allPendingFiles || []).filter((file: any) => {
      const email = file.ingest_emails;
      const fileTenantId = detectTenantFromEmail(email);
      const matches = fileTenantId === ctx.tenantId;
      
      // Exclude if file was recently parsed (within last 5 minutes) - it might be updating
      if (matches && file.parsed_at) {
        const parsedTime = new Date(file.parsed_at);
        const now = new Date();
        const minutesSinceParse = (now.getTime() - parsedTime.getTime()) / (1000 * 60);
        if (minutesSinceParse < 5) {
          console.log(`[EMAIL PARSE HEALTH] Pending file ${file.filename} (${file.id}) was recently parsed (${minutesSinceParse.toFixed(1)} min ago) - excluding from stuck pending`);
          return false;
        }
      }
      
      if (matches) {
        console.log(`[EMAIL PARSE HEALTH] Pending file ${file.filename} (${file.id}) matches tenant ${ctx.tenantId} and is truly stuck`);
      }
      return matches;
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
      const matches = fileTenantId === ctx.tenantId;
      if (matches) {
        console.log(`[EMAIL PARSE HEALTH] Parsed file ${file.filename} (${file.id}) matches tenant ${ctx.tenantId}, will check for empty results`);
      }
      return matches;
    }).slice(0, 50);

    if (parsedError) {
      console.error("[EMAIL PARSE HEALTH] Error fetching parsed files:", parsedError);
    }

    // For parsed files, check if they have staging rows or bookings
    const parsedWithIssues: any[] = [];
    if (parsedFiles) {
      console.log(`[EMAIL PARSE HEALTH] Checking ${parsedFiles.length} parsed files for empty results...`);
      for (const file of parsedFiles) {
        const emailId = (file.ingest_emails as any).id;
        
        // Check staging rows for this specific file
        const { data: stagingRows, count: stagingCount } = await adminClient
          .from("booking_import_staging")
          .select("id, reference, vehicle_reg, start_at", { count: "exact" })
          .eq("source_email_id", emailId)
          .eq("source_filename", file.filename);

        let bookingCount = 0;
        
        // If we have staging rows, check for matching bookings
        if (stagingRows && stagingRows.length > 0) {
          // Get unique references and plates from staging
          const refs = [...new Set(stagingRows.map(s => s.reference).filter(Boolean))];
          const plates = [...new Set(stagingRows.map(s => s.vehicle_reg).filter(Boolean))];
          
          console.log(`[EMAIL PARSE HEALTH] File ${file.filename} staging:`, {
            stagingCount: stagingCount || 0,
            uniqueRefs: refs.length,
            uniquePlates: plates.length,
            sampleRefs: refs.slice(0, 3),
            samplePlates: plates.slice(0, 3),
          });
          
          // Check for bookings that match staging rows by reference OR plate
          // We use OR because a booking might match by either field
          if (refs.length > 0 || plates.length > 0) {
            // Build OR condition for Supabase
            let orCondition = "";
            if (refs.length > 0 && plates.length > 0) {
              orCondition = `reference.in.(${refs.join(",")}),plate.in.(${plates.join(",")})`;
            } else if (refs.length > 0) {
              orCondition = `reference.in.(${refs.join(",")})`;
            } else {
              orCondition = `plate.in.(${plates.join(",")})`;
            }
            
            // Try to find bookings matching any of the references or plates
            const { data: matchingBookings, count, error: bookingError } = await adminClient
              .from("bookings")
              .select("id, reference, plate", { count: "exact" })
              .eq("tenant_id", ctx.tenantId)
              .or(orCondition);
            
            if (bookingError) {
              console.error(`[EMAIL PARSE HEALTH] Error checking bookings for ${file.filename}:`, bookingError);
            }
            
            bookingCount = count || 0;
            
            console.log(`[EMAIL PARSE HEALTH] File ${file.filename} bookings:`, {
              bookingCount,
              orCondition,
              sampleMatches: matchingBookings?.slice(0, 3)?.map(b => ({ ref: b.reference, plate: b.plate })),
            });
          }
        } else {
          // No staging rows - check if bookings were created recently (within 10 minutes of parse time)
          // This handles cases where staging was cleared but bookings exist
          if (file.parsed_at) {
            const parsedTime = new Date(file.parsed_at);
            const checkStart = new Date(parsedTime.getTime() - 5 * 60 * 1000); // 5 min before
            const checkEnd = new Date(parsedTime.getTime() + 10 * 60 * 1000); // 10 min after
            
            const { count: recentBookingCount } = await adminClient
              .from("bookings")
              .select("*", { count: "exact", head: true })
              .eq("tenant_id", ctx.tenantId)
              .gte("created_at", checkStart.toISOString())
              .lte("created_at", checkEnd.toISOString());
            
            bookingCount = recentBookingCount || 0;
            
            console.log(`[EMAIL PARSE HEALTH] File ${file.filename} no staging, checking recent bookings:`, {
              parsedAt: file.parsed_at,
              checkWindow: `${checkStart.toISOString()} to ${checkEnd.toISOString()}`,
              recentBookingCount: bookingCount,
            });
          }
        }

        console.log(`[EMAIL PARSE HEALTH] File ${file.filename} final check:`, {
          fileId: file.id,
          stagingCount: stagingCount || 0,
          bookingCount,
          parsedAt: file.parsed_at,
          isEmpty: (stagingCount || 0) === 0 && bookingCount === 0,
        });

        // If parsed but no staging rows AND no bookings, it's a potential issue
        // Note: We check both because staging might have been cleared but bookings exist
        if ((stagingCount || 0) === 0 && bookingCount === 0) {
          console.log(`[EMAIL PARSE HEALTH] ⚠️ File ${file.filename} (${file.id}) parsed but empty - adding to issues`);
          parsedWithIssues.push({
            ...file,
            staging_count: stagingCount || 0,
            booking_count: bookingCount,
          });
        } else {
          console.log(`[EMAIL PARSE HEALTH] ✅ File ${file.filename} (${file.id}) has data (staging: ${stagingCount || 0}, bookings: ${bookingCount}) - NOT adding to issues`);
        }
      }
      console.log(`[EMAIL PARSE HEALTH] Found ${parsedWithIssues.length} empty parsed files out of ${parsedFiles.length} total`);
    }

    const hasFailures = (failedFiles?.length || 0) > 0;
    const hasStuckPending = (pendingFiles?.length || 0) > 0;
    const hasEmptyParses = parsedWithIssues.length > 0;

    console.log(`[EMAIL PARSE HEALTH] Summary:`, {
      failedCount: failedFiles?.length || 0,
      stuckPendingCount: pendingFiles?.length || 0,
      emptyParsedCount: parsedWithIssues.length,
      hasIssues: hasFailures || hasStuckPending || hasEmptyParses,
    });

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
