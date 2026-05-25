import type { SupabaseClient } from "@supabase/supabase-js";
import { recordIngestFailureAlert } from "@/lib/ingest/ingestFailureAlert";

export type MarkIngestFailureInput = {
  emailId: string;
  error: string;
  tenantId?: string | null;
  supplierCode?: string | null;
  fromAddress?: string | null;
  subject?: string | null;
  toAddress?: string | null;
};

/**
 * Mark ingest_email + parse row as failed and emit operator alert.
 */
export async function markIngestFailure(
  supabase: SupabaseClient,
  input: MarkIngestFailureInput
): Promise<void> {
  const errorStr = input.error.slice(0, 4000);

  await supabase
    .from("ingest_emails")
    .update({ status: "failed", error: errorStr })
    .eq("id", input.emailId);

  await supabase.from("ingest_email_parses").upsert(
    {
      ingest_email_id: input.emailId,
      parse_status: "failed",
      parse_error: errorStr,
      parsed_at: new Date().toISOString(),
    },
    { onConflict: "ingest_email_id" }
  );

  await recordIngestFailureAlert(supabase, {
    emailId: input.emailId,
    tenantId: input.tenantId,
    supplierCode: input.supplierCode,
    fromAddress: input.fromAddress,
    subject: input.subject,
    toAddress: input.toAddress,
    error: errorStr,
  });
}

export async function markIngestSuccess(
  supabase: SupabaseClient,
  emailId: string
): Promise<void> {
  await supabase
    .from("ingest_emails")
    .update({ status: "parsed", error: null })
    .eq("id", emailId);
}
