import { createAdminClient } from "@/lib/supabase/server-admin";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { NextResponse } from "next/server";
import { isBookingCapableFile } from "@/lib/ingest/fileTypeUtils";

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
    // Only include files with parse_outcome='failed' (not 'skipped')
    // We'll filter by tenant after fetching by checking email mapping
    const { data: allFailedFiles, error: failedError } = await adminClient
      .from("ingest_email_files")
      .select(`
        id,
        filename,
        parse_status,
        parse_outcome,
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
      .eq("parse_outcome", "failed")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    // Filter by tenant and only include booking-capable files
    // Skip image files and other non-booking attachments
    const failedFiles = (allFailedFiles || []).filter((file: any) => {
      const email = file.ingest_emails;
      const fileTenantId = detectTenantFromEmail(email);
      const matches = fileTenantId === ctx.tenantId;
      
      // Only include booking-capable files in alerts
      const isBookingCapable = isBookingCapableFile(file.filename);
      
      if (matches && isBookingCapable) {
        console.log(`[EMAIL PARSE HEALTH] Failed booking-capable file ${file.filename} (${file.id}) matches tenant ${ctx.tenantId}`);
      } else if (matches && !isBookingCapable) {
        console.log(`[EMAIL PARSE HEALTH] Skipping non-booking-capable failed file ${file.filename} (${file.id}) from alerts`);
      }
      
      return matches && isBookingCapable;
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
        
        // Special logging for the file that keeps appearing
        const isProblemFile = file.id === '61710715-0082-4652-a79e-9825cbddf4be';
        if (isProblemFile) {
          console.log(`[EMAIL PARSE HEALTH] 🔍 DEBUGGING PROBLEM FILE:`, {
            fileId: file.id,
            filename: file.filename,
            emailId,
            parsedAt: file.parsed_at,
            createdAt: file.created_at,
          });
        }
        
        // Check staging rows for this specific file
        const { data: stagingRows, count: stagingCount, error: stagingError } = await adminClient
          .from("booking_import_staging")
          .select("id, reference, vehicle_reg, start_at", { count: "exact" })
          .eq("source_email_id", emailId)
          .eq("source_filename", file.filename);
        
        if (isProblemFile) {
          console.log(`[EMAIL PARSE HEALTH] 🔍 PROBLEM FILE staging check:`, {
            emailId,
            filename: file.filename,
            stagingCount: stagingCount || 0,
            stagingRows: stagingRows?.length || 0,
            stagingError: stagingError?.message,
            sampleStaging: stagingRows?.slice(0, 3),
          });
        }

        let bookingCount = 0;
        let hasSuccessfulImportRun = false;
        
        // First, check if there's a recent successful import run for this file
        // Import runs are created with profile_name like "Email import: filename"
        // Note: inserted_count includes both NEW inserts AND updates to existing bookings
        if (file.parsed_at) {
          const parsedTime = new Date(file.parsed_at);
          const checkStart = new Date(parsedTime.getTime() - 10 * 60 * 1000); // 10 min before (wider window)
          const checkEnd = new Date(parsedTime.getTime() + 10 * 60 * 1000); // 10 min after
          
          // Try exact match first, then partial match
          // Escape special characters in filename for LIKE query
          const exactMatch = `Email import: ${file.filename}`;
          const escapedFilename = file.filename.replace(/%/g, '\\%').replace(/_/g, '\\_');
          
          const { data: importRuns, error: importRunError } = await adminClient
            .from("import_runs")
            .select("id, inserted_count, error_count, created_at, profile_name")
            .eq("tenant_id", ctx.tenantId)
            .gte("created_at", checkStart.toISOString())
            .lte("created_at", checkEnd.toISOString())
            .or(`profile_name.eq.${exactMatch},profile_name.ilike.%${escapedFilename}%`);
          
          if (isProblemFile) {
            console.log(`[EMAIL PARSE HEALTH] 🔍 PROBLEM FILE checking import runs:`, {
              exactMatch,
              escapedFilename,
              checkWindow: `${checkStart.toISOString()} to ${checkEnd.toISOString()}`,
            });
          }
          
          if (importRunError) {
            console.error(`[EMAIL PARSE HEALTH] Error checking import runs for ${file.filename}:`, importRunError);
          }
          
          if (importRuns && importRuns.length > 0) {
            // Find the run with the best match (exact first, then any with inserted_count > 0)
            const exactMatchRun = importRuns.find(run => run.profile_name === exactMatch);
            const successfulRun = exactMatchRun || importRuns.find(run => (run.inserted_count || 0) > 0);
            
            if (successfulRun && (successfulRun.inserted_count || 0) > 0) {
              hasSuccessfulImportRun = true;
              bookingCount = successfulRun.inserted_count || 0;
              
              if (isProblemFile) {
                console.log(`[EMAIL PARSE HEALTH] 🔍 PROBLEM FILE found successful import run:`, {
                  runId: successfulRun.id,
                  insertedCount: successfulRun.inserted_count,
                  errorCount: successfulRun.error_count,
                  createdAt: successfulRun.created_at,
                  profileName: successfulRun.profile_name,
                  allRunsFound: importRuns.map(r => ({ id: r.id, profile: r.profile_name, inserted: r.inserted_count })),
                });
              } else {
                console.log(`[EMAIL PARSE HEALTH] File ${file.filename} found import run:`, {
                  insertedCount: successfulRun.inserted_count,
                  profileName: successfulRun.profile_name,
                });
              }
            } else if (isProblemFile) {
              console.log(`[EMAIL PARSE HEALTH] 🔍 PROBLEM FILE import runs found but none successful:`, {
                runsFound: importRuns.length,
                runs: importRuns.map(r => ({ id: r.id, profile: r.profile_name, inserted: r.inserted_count, errors: r.error_count })),
              });
            }
          } else if (isProblemFile) {
            console.log(`[EMAIL PARSE HEALTH] 🔍 PROBLEM FILE no import runs found in window:`, {
              parsedAt: file.parsed_at,
              checkWindow: `${checkStart.toISOString()} to ${checkEnd.toISOString()}`,
              expectedProfile: exactMatch,
            });
          }
        }
        
        // If import run shows 0 but we have staging rows, the bookings might have been updated (not inserted)
        // Check if bookings exist that match the staging rows
        if (hasSuccessfulImportRun && bookingCount === 0 && stagingRows && stagingRows.length > 0) {
          // Import run exists but shows 0 - might be updates instead of inserts
          // Check if bookings matching staging rows exist (they were updated, not inserted)
          const refs = [...new Set(stagingRows.map(s => s.reference).filter(Boolean))];
          const plates = [...new Set(stagingRows.map(s => s.vehicle_reg).filter(Boolean))];
          
          if (refs.length > 0 || plates.length > 0) {
            let orCondition = "";
            if (refs.length > 0 && plates.length > 0) {
              orCondition = `reference.in.(${refs.join(",")}),plate.in.(${plates.join(",")})`;
            } else if (refs.length > 0) {
              orCondition = `reference.in.(${refs.join(",")})`;
            } else {
              orCondition = `plate.in.(${plates.join(",")})`;
            }
            
            const { count: existingBookingCount } = await adminClient
              .from("bookings")
              .select("*", { count: "exact", head: true })
              .eq("tenant_id", ctx.tenantId)
              .or(orCondition);
            
            if (existingBookingCount && existingBookingCount > 0) {
              bookingCount = existingBookingCount;
              if (isProblemFile) {
                console.log(`[EMAIL PARSE HEALTH] 🔍 PROBLEM FILE import run shows 0, but found ${existingBookingCount} existing bookings (were updated, not inserted)`);
              }
            }
          }
        }
        
        // If we have staging rows, check for matching bookings
        if (!hasSuccessfulImportRun && stagingRows && stagingRows.length > 0) {
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
            
            if (isProblemFile) {
              console.log(`[EMAIL PARSE HEALTH] 🔍 PROBLEM FILE bookings check (via staging):`, {
                bookingCount,
                orCondition,
                refs,
                plates,
                sampleMatches: matchingBookings?.slice(0, 3)?.map(b => ({ ref: b.reference, plate: b.plate })),
                bookingError: bookingError?.message,
              });
            } else {
              console.log(`[EMAIL PARSE HEALTH] File ${file.filename} bookings:`, {
                bookingCount,
                orCondition,
                sampleMatches: matchingBookings?.slice(0, 3)?.map(b => ({ ref: b.reference, plate: b.plate })),
              });
            }
          }
        } else if (!hasSuccessfulImportRun) {
          // No staging rows and no import run - check if bookings were created recently (within 10 minutes of parse time)
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
            
            if (isProblemFile) {
              console.log(`[EMAIL PARSE HEALTH] 🔍 PROBLEM FILE bookings check (time window fallback):`, {
                parsedAt: file.parsed_at,
                checkWindow: `${checkStart.toISOString()} to ${checkEnd.toISOString()}`,
                recentBookingCount: bookingCount,
                now: new Date().toISOString(),
              });
            } else {
              console.log(`[EMAIL PARSE HEALTH] File ${file.filename} no staging, checking recent bookings:`, {
                parsedAt: file.parsed_at,
                checkWindow: `${checkStart.toISOString()} to ${checkEnd.toISOString()}`,
                recentBookingCount: bookingCount,
              });
            }
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
          if (isProblemFile) {
            console.log(`[EMAIL PARSE HEALTH] ⚠️ PROBLEM FILE ${file.filename} (${file.id}) parsed but empty - adding to issues`, {
              stagingCount: stagingCount || 0,
              bookingCount,
              parsedAt: file.parsed_at,
            });
          } else {
            console.log(`[EMAIL PARSE HEALTH] ⚠️ File ${file.filename} (${file.id}) parsed but empty - adding to issues`);
          }
          parsedWithIssues.push({
            ...file,
            staging_count: stagingCount || 0,
            booking_count: bookingCount,
          });
        } else {
          if (isProblemFile) {
            console.log(`[EMAIL PARSE HEALTH] ✅ PROBLEM FILE ${file.filename} (${file.id}) HAS DATA - NOT adding to issues`, {
              stagingCount: stagingCount || 0,
              bookingCount,
              parsedAt: file.parsed_at,
            });
          } else {
            console.log(`[EMAIL PARSE HEALTH] ✅ File ${file.filename} (${file.id}) has data (staging: ${stagingCount || 0}, bookings: ${bookingCount}) - NOT adding to issues`);
          }
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
