import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { NextRequest, NextResponse } from "next/server";
import { logRequestAttribution } from "@/lib/jobSecret";
import { getEmailParseHealth } from "@/lib/health/emailParse";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    logRequestAttribution(req, "/api/admin/email-parse/health");
    const ctx = await getCurrentTenantContext();
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "No tenant context" }, { status: 401 });
    }
    const result = await getEmailParseHealth(ctx.tenantId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[EMAIL PARSE HEALTH] Unexpected error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
