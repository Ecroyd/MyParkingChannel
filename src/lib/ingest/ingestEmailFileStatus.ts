import type { SupabaseClient } from "@supabase/supabase-js";

export type IngestEmailFileRow = {
  id: string;
  parse_status?: string | null;
  parse_outcome?: string | null;
};

export type FinalizeEmailFileParseInput = {
  fileId: string;
  parseReason: string;
  parseOutcome?: "parsed" | "empty" | "skipped";
  parserKey?: string | null;
  detectedSource?: string | null;
  externalSource?: string | null;
  attributionConfidence?: string | null;
};

/**
 * True when the health banner should list this file as a parse failure.
 * Only parse_status='failed' — not stale parse_outcome after a successful retry.
 */
export function isFileParseFailedForBanner(file: {
  parse_status?: string | null;
}): boolean {
  return file.parse_status === "failed";
}

/**
 * Reset ingest_email_files before admin retry/reprocess (failed or parsed, not skipped).
 */
export async function prepareIngestEmailFileForRetry(
  supabase: SupabaseClient,
  fileId: string
): Promise<void> {
  const { error } = await supabase
    .from("ingest_email_files")
    .update({
      parse_status: "pending",
      parse_outcome: null,
      parse_error: null,
      parse_reason: null,
      parsed_at: null,
    })
    .eq("id", fileId);

  if (error) {
    throw new Error(`prepareIngestEmailFileForRetry failed: ${error.message}`);
  }
}

export function shouldPrepareIngestEmailFileForRetry(file: IngestEmailFileRow): boolean {
  if (file.parse_status === "parsed" && file.parse_outcome === "skipped") {
    return false;
  }
  return (
    file.parse_status === "failed" ||
    file.parse_status === "parsed" ||
    file.parse_status === "pending"
  );
}

/**
 * Persist successful parse on the same ingest_email_files row (admin retry + live ingest).
 */
export async function finalizeIngestEmailFileParseSuccess(
  supabase: SupabaseClient,
  input: FinalizeEmailFileParseInput
): Promise<void> {
  const parsedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("ingest_email_files")
    .update({
      parse_status: "parsed",
      parse_outcome: input.parseOutcome ?? "parsed",
      parse_error: null,
      parse_reason: input.parseReason,
      parsed_at: parsedAt,
      parser_key: input.parserKey ?? null,
      detected_source: input.detectedSource ?? null,
      external_source: input.externalSource ?? null,
      attribution_confidence: input.attributionConfidence ?? null,
    })
    .eq("id", input.fileId)
    .select("id, parse_status, parse_outcome, parse_reason, parsed_at")
    .single();

  if (error) {
    throw new Error(`finalizeIngestEmailFileParseSuccess failed: ${error.message}`);
  }
  if (!data || data.parse_status !== "parsed") {
    throw new Error(
      `finalizeIngestEmailFileParseSuccess: row ${input.fileId} not updated to parsed`
    );
  }
}

export async function markIngestEmailFileParseFailed(
  supabase: SupabaseClient,
  fileId: string,
  errorMessage: string,
  parseReason?: string
): Promise<void> {
  const { error } = await supabase
    .from("ingest_email_files")
    .update({
      parse_status: "failed",
      parse_outcome: "failed",
      parse_error: errorMessage,
      parse_reason: parseReason ?? `exception:${errorMessage.substring(0, 200)}`,
    })
    .eq("id", fileId);

  if (error) {
    console.error(`[markIngestEmailFileParseFailed] update failed:`, error);
  }
}
