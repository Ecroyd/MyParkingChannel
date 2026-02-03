import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { NextResponse } from "next/server";
import { isBookingCapableFile } from "@/lib/ingest/fileTypeUtils";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ingest/recent
 * Returns the last 10 ingest emails with a success flag (tick when import was successful).
 * Auth: tenant admin/owner (same as email-parse/health).
 */
export async function GET() {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== "admin" && ctx.role !== "owner")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const limit = 10;

    const { data: emails, error } = await supabase
      .from("ingest_emails")
      .select(
        `
        id,
        created_at,
        from_address,
        to_address,
        subject,
        ingest_email_files (
          id,
          filename,
          parse_status,
          parse_outcome
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: recentRuns } = await supabase
      .from("import_runs")
      .select("id, profile_name, inserted_count, error_count, created_at")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    const importRuns = recentRuns || [];

    const result = await Promise.all(
      (emails || []).map(async (email: any) => {
        const files = email.ingest_email_files || [];
        const bookingFiles = files.filter((f: any) => isBookingCapableFile(f.filename));
        const bookingFilesParsedCount = bookingFiles.filter(
          (f: any) => f.parse_outcome === "parsed"
        ).length;
        const bookingFilesFailedCount = bookingFiles.filter(
          (f: any) => f.parse_outcome === "failed"
        ).length;

        const { count: bookingCandidatesCount } = await supabase
          .from("booking_import_staging")
          .select("*", { count: "exact", head: true })
          .eq("source_email_id", email.id);

        const emailFilenames = files.map((f: any) => f.filename);
        const matchingRuns = importRuns.filter((run: any) =>
          run.profile_name
            ? emailFilenames.some((fn: string) => run.profile_name.includes(fn))
            : false
        );
        const bookingsCreatedCount = matchingRuns.reduce(
          (sum: number, run: any) => sum + (run.inserted_count || 0),
          0
        );

        const pipelineStatus = determineStatus(
          files,
          importRuns,
          {
            bookingFilesParsedCount,
            bookingFilesFailedCount,
            bookingCandidatesCount: bookingCandidatesCount || 0,
            bookingsCreatedCount,
          }
        );

        const success =
          pipelineStatus === "bookings_imported" ||
          pipelineStatus === "bookings_imported_with_warnings" ||
          pipelineStatus === "no_attachment";

        return {
          email_id: email.id,
          from_address: email.from_address,
          subject: email.subject,
          received_at: email.created_at,
          success,
          pipeline_status: pipelineStatus,
        };
      })
    );

    return NextResponse.json({ ok: true, emails: result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

function determineStatus(
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

  const hasPending = files.some(
    (f) => f.parse_status === "pending" && isBookingCapableFile(f.filename)
  );
  if (hasPending) return "file_pending";

  if (metrics.bookingsCreatedCount > 0 || metrics.bookingCandidatesCount > 0) {
    if (metrics.bookingFilesFailedCount > 0) {
      return "bookings_imported_with_warnings";
    }
    return "bookings_imported";
  }

  if (
    metrics.bookingsCreatedCount === 0 &&
    metrics.bookingCandidatesCount === 0 &&
    metrics.bookingFilesFailedCount > 0
  ) {
    return "file_parse_failed";
  }

  if (metrics.bookingFilesParsedCount > 0 && importRuns.length === 0) {
    return "file_parsed_not_imported";
  }

  if (importRuns.length > 0 && importRuns[0].error_count > 0) {
    return "import_errors";
  }

  return "unknown";
}
