import { redirect } from "next/navigation";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { roleAtLeast } from "@/lib/auth/permissions";
import VisitorsDashboard from "@/components/admin/visitors/VisitorsDashboard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Visitors" };

/** Who is on the car park's booking site and where they came from. Admins and owners. */
export default async function VisitorsPage() {
  const ctx = await getCurrentTenantContext();
  if (!ctx) redirect("/login");
  if (!roleAtLeast(ctx.role, "admin")) redirect("/admin");

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Visitors</h1>
        <p className="text-sm text-muted-foreground">
          People on your booking website, where they came from and how many went on to checkout. No cookies are
          used: each visitor is counted once a day and can&apos;t be followed from day to day.
        </p>
      </div>
      <VisitorsDashboard />
    </section>
  );
}
