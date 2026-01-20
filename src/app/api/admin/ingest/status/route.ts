import { getServiceSupabase } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

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

    // Combine data
    const result = emails?.map((email: any) => {
      const files = email.ingest_email_files || [];
      const pipelineStatus = determineStatus(email, files, importRuns);

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
          parse_error: f.parse_error,
          parsed_at: f.parsed_at,
        })),
        pipeline_status: pipelineStatus,
        has_attachment: files.length > 0,
        has_parsed_file: files.some((f: any) => f.parse_status === "parsed"),
        has_import_run: importRuns.length > 0,
      };
    });

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

function determineStatus(email: any, files: any[], importRuns: any[]): string {
  if (files.length === 0) return "no_attachment";
  
  const hasPending = files.some((f) => f.parse_status === "pending");
  if (hasPending) return "file_pending";
  
  const hasFailed = files.some((f) => f.parse_status === "failed");
  if (hasFailed) return "file_parse_failed";
  
  const hasParsed = files.some((f) => f.parse_status === "parsed");
  if (hasParsed && importRuns.length === 0) return "file_parsed_not_imported";
  
  if (importRuns.length > 0) {
    const run = importRuns[0];
    if (run.inserted_count > 0) return "bookings_imported";
    if (run.error_count > 0) return "import_errors";
  }
  
  return "unknown";
}
