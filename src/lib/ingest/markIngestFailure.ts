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

export type IngestParseSuccessPatch = {
  parsed_subject?: string | null;
  parsed_text?: string | null;
  forwarded_text?: string | null;
  booking_plate_guess?: string | null;
  booking_reference_guess?: string | null;
};

/**
 * Finalize successful ingest/reprocess: clear all error fields and mark parsed.
 * Call when booking upsert (or full pipeline success with booking) completes.
 */
export async function markIngestSuccess(
  supabase: SupabaseClient,
  emailId: string,
  parsePatch?: IngestParseSuccessPatch
): Promise<void> {
  const parsedAt = new Date().toISOString();

  await supabase
    .from("ingest_emails")
    .update({ status: "parsed", error: null })
    .eq("id", emailId);

  await supabase.from("ingest_email_parses").upsert(
    {
      ingest_email_id: emailId,
      parse_status: "parsed",
      parse_error: null,
      parsed_at: parsedAt,
      ...parsePatch,
    },
    { onConflict: "ingest_email_id" }
  );
}

/**
 * Reset email/parse error state before admin reprocess replay.
 */
export async function clearIngestEmailForReprocess(
  supabase: SupabaseClient,
  emailId: string
): Promise<void> {
  await supabase
    .from("ingest_emails")
    .update({ status: "received", error: null })
    .eq("id", emailId);

  await supabase.from("ingest_email_parses").delete().eq("ingest_email_id", emailId);
}
