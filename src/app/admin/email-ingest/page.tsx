import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { redirect } from "next/navigation";
import EmailIngestClient from "./EmailIngestClient";

export const dynamic = "force-dynamic";

export default async function EmailIngestAdminPage() {
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    redirect("/login");
  }
  if (ctx.role !== "admin" && ctx.role !== "owner") {
    redirect("/admin");
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Email Ingest Failures</h1>
      <p className="text-sm text-gray-600 mb-6">
        Failed inbound emails are always stored with raw RFC822. Reprocess from here without
        resending from Cloudflare.
      </p>
      <EmailIngestClient />
    </div>
  );
}
