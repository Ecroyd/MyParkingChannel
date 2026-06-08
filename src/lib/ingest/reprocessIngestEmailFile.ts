import { parseEmailFile } from "@/lib/ingest/parseEmailFile";

export type ReprocessIngestEmailFileResult = Awaited<ReturnType<typeof parseEmailFile>>;

/**
 * Single entry point for admin Retry/Reprocess and internal re-parse.
 * Always runs parseEmailFile (staging dedupe + booking promotion).
 */
export async function reprocessIngestEmailFile(
  fileId: string,
  tenantId: string
): Promise<ReprocessIngestEmailFileResult> {
  return parseEmailFile(fileId, tenantId);
}
