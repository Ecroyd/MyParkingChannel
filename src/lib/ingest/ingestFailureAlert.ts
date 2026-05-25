import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSyncAlert } from "@/lib/suppliers/alerting";
import { writeHealthStatus } from "@/lib/health/writeHealthStatus";

export type IngestFailureAlertInput = {
  emailId: string;
  tenantId?: string | null;
  supplierCode?: string | null;
  fromAddress?: string | null;
  subject?: string | null;
  toAddress?: string | null;
  error: string;
};

/**
 * Record ingest failure for operators: supplier_sync_alerts (per-tenant) and
 * platform system_health_status when tenant is unknown.
 */
export async function recordIngestFailureAlert(
  _supabase: SupabaseClient,
  input: IngestFailureAlertInput
): Promise<void> {
  const {
    emailId,
    tenantId,
    supplierCode,
    fromAddress,
    subject,
    toAddress,
    error,
  } = input;

  const message = `Email ingest failed: ${error.slice(0, 500)}`;
  const meta = {
    email_id: emailId,
    from_address: fromAddress ?? null,
    to_address: toAddress ?? null,
    subject: subject ?? null,
    error,
  };

  if (tenantId) {
    await createSyncAlert({
      tenantId,
      supplierCode: supplierCode ?? "email_ingest",
      runId: null,
      errors: [message],
      severity: "error",
    }).catch((err) => {
      console.error("[ingest-alert] createSyncAlert failed", err);
    });
  }

  await writeHealthStatus(null, "email_ingest", {
    ok: false,
    severity: "error",
    lastFailureAt: new Date().toISOString(),
    emailId,
    fromAddress: fromAddress ?? null,
    subject: subject ?? null,
    toAddress: toAddress ?? null,
    error,
    meta,
  }).catch((err) => {
    console.error("[ingest-alert] writeHealthStatus failed", err);
  });
}
