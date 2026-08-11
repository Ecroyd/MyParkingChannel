import { NextRequest, NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { canViewAnalytics } from "@/lib/auth/permissions";
import {
  getAttributionBreakdown,
  getFunnelSummaryForTenant,
  getMigrationComparison,
  resolvePresetRange,
} from "@/lib/website-performance/aggregate";

export const dynamic = "force-dynamic";

/**
 * Tenant-scoped website performance summary.
 * Tenant always comes from the authenticated membership context — never from the client body.
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canViewAnalytics(ctx.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Ignore any client tenant_id
    const sp = req.nextUrl.searchParams;
    const preset = (sp.get("preset") || "30d") as "today" | "7d" | "30d" | "90d" | "custom";
    const range = resolvePresetRange(preset, sp.get("from") || undefined, sp.get("to") || undefined);

    const mode = sp.get("mode"); // funnel | migration
    if (mode === "migration") {
      const migrationDate = sp.get("migration_date");
      const comparisonDays = Number(sp.get("comparison_days") || "30");
      if (!migrationDate || !/^\d{4}-\d{2}-\d{2}$/.test(migrationDate)) {
        return NextResponse.json({ error: "migration_date required (YYYY-MM-DD)" }, { status: 400 });
      }
      const comparison = await getMigrationComparison(
        ctx.tenantId,
        migrationDate,
        comparisonDays
      );
      return NextResponse.json({
        tenantId: ctx.tenantId,
        mode: "migration",
        comparison,
      });
    }

    const [funnel, attribution] = await Promise.all([
      getFunnelSummaryForTenant(ctx.tenantId, range),
      getAttributionBreakdown(ctx.tenantId, range),
    ]);

    return NextResponse.json({
      tenantId: ctx.tenantId,
      mode: "funnel",
      range,
      preset,
      funnel,
      attribution,
    });
  } catch (err) {
    console.error("[admin/website-performance]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
