import { NextResponse } from "next/server";
import { requireSeoAdminContext } from "@/lib/seo/admin-context";

/** Back-compat status endpoint used by older clients. */
export async function GET() {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json(
      { status: "error", message: auth.error, setupRequired: false },
      { status: auth.status }
    );
  }

  return NextResponse.json({
    status: "ok",
    tenantId: auth.ctx.tenantId,
    siteId: auth.ctx.siteId,
    setupRequired: false,
  });
}
