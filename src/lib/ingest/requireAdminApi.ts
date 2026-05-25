import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { NextResponse } from "next/server";

export async function requireAdminApi() {
  const ctx = await getCurrentTenantContext();
  if (!ctx || (ctx.role !== "admin" && ctx.role !== "owner")) {
    return { ctx: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ctx, response: null as null };
}
