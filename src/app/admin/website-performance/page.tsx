import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { canViewAnalytics } from "@/lib/auth/permissions";
import WebsitePerformanceDashboard from "@/components/website-performance/WebsitePerformanceDashboard";

export default async function WebsitePerformancePage() {
  const ctx = await getCurrentTenantContext();

  if (!ctx) {
    redirect("/login");
  }

  if (!canViewAnalytics(ctx.role)) {
    redirect("/admin");
  }

  const adminClient = createAdminClient();
  const { data: tenant } = await adminClient
    .from("tenants")
    .select("id, name, slug, timezone")
    .eq("id", ctx.tenantId)
    .single();

  if (!tenant) {
    redirect("/admin");
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Website Performance</h1>
        <p className="text-sm text-muted-foreground">
          Conversion funnel from website visit through paid booking — tenant-scoped first-party
          analytics
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
        <WebsitePerformanceDashboard
          tenantName={tenant.name}
          timezone={tenant.timezone || "Europe/London"}
        />
      </Suspense>
    </section>
  );
}
