import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";

// Map email addresses/domains to tenant IDs
// TODO: Move this to a database table for easier management
const EMAIL_TO_TENANT_MAP: Record<string, string> = {
  // Example:
  // "bookings@myparkingchannel.app": "tenant-uuid-here",
  // "aph@supplier.com": "tenant-uuid-here",
};

function detectTenantFromEmail(email: any): string | null {
  // Try explicit mapping
  if (email.from_address && EMAIL_TO_TENANT_MAP[email.from_address]) {
    return EMAIL_TO_TENANT_MAP[email.from_address];
  }

  // Try domain mapping
  if (email.from_address) {
    const domain = email.from_address.split("@")[1];
    if (domain && EMAIL_TO_TENANT_MAP[domain]) {
      return EMAIL_TO_TENANT_MAP[domain];
    }
  }

  return null;
}

export async function GET(req: Request) {
  try {
    // Verify cron secret (if set)
    const authHeader = req.headers.get("authorization");
    if (process.env.CRON_SECRET) {
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const supabase = getServiceSupabase();

    // Find pending files
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
      .limit(10);

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
    const baseUrl = process.env.NEXT_PUBLIC_ROOT_URL || "http://localhost:3002";

    // Process each file
    for (const file of pendingFiles) {
      const email = (file as any).ingest_emails;
      
      // Determine tenant ID
      const tenantId = detectTenantFromEmail(email);

      if (!tenantId) {
        console.log(`[cron-parse] Skipping ${file.filename}: no tenant mapping for ${email?.from_address}`);
        results.push({
          fileId: file.id,
          filename: file.filename,
          status: "skipped",
          reason: `No tenant mapping for ${email?.from_address}`,
        });
        continue;
      }

      try {
        // Call the parse-file endpoint
        const parseResponse = await fetch(`${baseUrl}/api/admin/ingest/parse-file`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fileId: file.id,
            tenantId,
          }),
        });

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
