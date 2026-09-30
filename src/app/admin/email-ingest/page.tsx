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
      <h1 className="text-2xl font-semibold mb-2">Email Ingest</h1>
      <p className="text-sm text-gray-600 mb-6">
        Inbound mail to <code>bookings@myparkingchannel.app</code> is stored and parsed into
        bookings. Use Recent to confirm mail arrived; Failures for rows that need a reprocess
        (raw RFC822 is kept — no need to resend from Cloudflare).
      </p>
      <EmailIngestClient />
    </div>
  );
}
