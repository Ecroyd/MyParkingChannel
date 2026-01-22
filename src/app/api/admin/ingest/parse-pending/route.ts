import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Map email addresses to tenant IDs
// You can expand this or move it to a database table
const EMAIL_TO_TENANT_MAP: Record<string, string> = {
  // Add mappings here, e.g.:
  // "bookings@myparkingchannel.app": "tenant-uuid-here",
  // Or detect from email domain/subject
};

function detectTenantFromEmail(email: any): string | null {
  // Try explicit mapping
  if (email.from_address && EMAIL_TO_TENANT_MAP[email.from_address]) {
    return EMAIL_TO_TENANT_MAP[email.from_address];
  }

  // Try to detect from email domain or subject
  // You can add more logic here based on your needs
  
  return null;
}

export async function POST(req: Request) {
  try {
    const { tenantId, limit = 10 } = await req.json();

    const supabase = getServiceSupabase();

    // 1. Find pending files
    const { data: pendingFiles, error: filesError } = await supabase
      .from("ingest_email_files")
      .select(`
        id,
        filename,
        email_id,
        ingest_emails (
          id,
          from_address,
          subject
        )
      `)
      .eq("parse_status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit || 10);

    if (filesError) {
      return NextResponse.json({ error: filesError.message }, { status: 500 });
    }

    if (!pendingFiles || pendingFiles.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        message: "No pending files",
        processed: 0,
      });
    }

    const results = [];

    // 2. Process each file
    for (const file of pendingFiles) {
      const email = (file as any).ingest_emails;
      
      // Determine tenant ID
      let fileTenantId = tenantId;
      if (!fileTenantId) {
        fileTenantId = detectTenantFromEmail(email);
      }

      if (!fileTenantId) {
        console.log(`[parse-pending] Skipping ${file.filename}: no tenant ID`);
        results.push({
          fileId: file.id,
          filename: file.filename,
          status: "skipped",
          reason: "No tenant ID",
        });
        continue;
      }

      try {
        // Call the parse-file endpoint
        const parseResponse = await fetch(
          `${process.env.NEXT_PUBLIC_ROOT_URL || "http://localhost:3002"}/api/admin/ingest/parse-file`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              fileId: file.id,
              tenantId: fileTenantId,
            }),
          }
        );

        const parseResult = await parseResponse.json();

        results.push({
          fileId: file.id,
          filename: file.filename,
          status: parseResponse.ok ? "success" : "failed",
          result: parseResult,
        });
      } catch (err: any) {
        results.push({
          fileId: file.id,
          filename: file.filename,
          status: "error",
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "unknown error" },
      { status: 500 }
    );
  }
}
