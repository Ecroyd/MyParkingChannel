import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import ImportRunsClient from "./ImportRunsClient";

export default async function ImportRunsPage() {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return <div>No tenant context</div>;
  }
  return <ImportRunsClient tenantId={ctx.tenantId} />;
}
