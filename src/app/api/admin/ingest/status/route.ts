import { getServiceSupabase } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isBookingCapableFile } from "@/lib/ingest/fileTypeUtils";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const status = searchParams.get("status"); // Filter by pipeline_status

    const supabase = getServiceSupabase();

    let query = supabase
      .from("ingest_emails")
      .select(`
        id,
        created_at,
        from_address,
        to_address,
        subject,
        message_id,
        status,
        sha256,
        ingest_email_files (
          id,
          filename,
          content_type,
          file_size,
          parse_status,
          parse_outcome,
          parse_reason,
          parse_error,
          parsed_at,
          created_at
        )
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    const { data: emails, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get recent import runs (last 7 days) to match with files
    // Note: You'll need to link import_runs to email_files via metadata or a join table
    const { data: recentRuns } = await supabase
      .from("import_runs")
      .select("id, profile_name, inserted_count, skipped_duplicates, error_count, created_at, meta")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(100);
    
    const importRuns = recentRuns || [];

    // Combine data and compute email-level metrics
    const result = await Promise.all((emails || []).map(async (email: any) => {
      const files = email.ingest_email_files || [];
      
      // Filter to booking-capable files only
      const bookingFiles = files.filter((f: any) => isBookingCapableFile(f.filename));
      
      // Compute metrics
      const bookingFilesParsedCount = bookingFiles.filter((f: any) => 
        f.parse_outcome === "parsed"
      ).length;
      
      const bookingFilesFailedCount = bookingFiles.filter((f: any) => 
        f.parse_outcome === "failed"
      ).length;
      
      // Count staging rows for this email (booking candidates)
      const { count: bookingCandidatesCount } = await supabase
        .from("booking_import_staging")
        .select("*", { count: "exact", head: true })
        .eq("source_email_id", email.id);
      
      // Count bookings created from this email (via import runs or direct matching)
      // Check import runs that match this email's files
      const emailFileIds = files.map((f: any) => f.id);
      const emailFilenames = files.map((f: any) => f.filename);
      
      // Find import runs that reference files from this email
      const matchingRuns = importRuns.filter((run: any) => {
        if (!run.profile_name) return false;
        return emailFilenames.some((filename: string) => 
          run.profile_name.includes(filename)
        );
      });
      
      // Sum up bookings from matching runs
      const bookingsCreatedCount = matchingRuns.reduce((sum: number, run: any) => 
        sum + (run.inserted_count || 0), 0
      );
      
      const pipelineStatus = determineStatus(
        email, 
        files, 
        importRuns,
        {
          bookingFilesParsedCount,
          bookingFilesFailedCount,
          bookingCandidatesCount: bookingCandidatesCount || 0,
          bookingsCreatedCount,
        }
      );

      return {
        email_id: email.id,
        email_received_at: email.created_at,
        from_address: email.from_address,
        to_address: email.to_address,
        subject: email.subject,
        message_id: email.message_id,
        email_status: email.status,
        files: files.map((f: any) => ({
          file_id: f.id,
          filename: f.filename,
          content_type: f.content_type,
          file_size: f.file_size,
          parse_status: f.parse_status,
          parse_outcome: f.parse_outcome,
          parse_reason: f.parse_reason,
          parse_error: f.parse_error,
          parsed_at: f.parsed_at,
        })),
        pipeline_status: pipelineStatus,
        has_attachment: files.length > 0,
        has_parsed_file: files.some((f: any) => f.parse_status === "parsed"),
        has_import_run: importRuns.length > 0,
        // New metrics
        booking_files_parsed_count: bookingFilesParsedCount,
        booking_files_failed_count: bookingFilesFailedCount,
        booking_candidates_count: bookingCandidatesCount || 0,
        bookings_created_count: bookingsCreatedCount,
      };
    }));

    return NextResponse.json({
      ok: true,
      count: result?.length || 0,
      emails: result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "unknown error" },
      { status: 500 }
    );
  }
}

function determineStatus(
  email: any, 
  files: any[], 
  importRuns: any[],
  metrics: {
    bookingFilesParsedCount: number;
    bookingFilesFailedCount: number;
    bookingCandidatesCount: number;
    bookingsCreatedCount: number;
  }
): string {
  if (files.length === 0) return "no_attachment";
  
  // Check for pending booking-capable files
  const hasPending = files.some((f) => 
    f.parse_status === "pending" && isBookingCapableFile(f.filename)
  );
  if (hasPending) return "file_pending";
  
  // Success: bookings created OR candidates in staging
  if (metrics.bookingsCreatedCount > 0 || metrics.bookingCandidatesCount > 0) {
    // Warning if some files failed but we still got bookings
    if (metrics.bookingFilesFailedCount > 0) {
      return "bookings_imported_with_warnings";
    }
    return "bookings_imported";
  }
  
  // Error: no bookings AND no candidates AND some files failed
  if (metrics.bookingsCreatedCount === 0 && 
      metrics.bookingCandidatesCount === 0 && 
      metrics.bookingFilesFailedCount > 0) {
    return "file_parse_failed";
  }
  
  // Parsed but not imported yet
  if (metrics.bookingFilesParsedCount > 0 && importRuns.length === 0) {
    return "file_parsed_not_imported";
  }
  
  // Check import runs for errors
  if (importRuns.length > 0) {
    const run = importRuns[0];
    if (run.error_count > 0) return "import_errors";
  }
  
  return "unknown";
}
