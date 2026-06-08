/**
 * Find and reprocess 27_HOURLY_20260518_183043.csv
 * Usage: npx tsx scripts/reprocess-hourly-file.ts
 */
import "./loadEnvLocal";
import { getServiceSupabase } from "../src/lib/supabase/service";

import { reprocessIngestEmailFile } from "../src/lib/ingest/reprocessIngestEmailFile";

const FILE_ID = "da3759d6-4101-41be-91f4-a0504fccebbf";
const TENANT_ID = "bab45dab-19e8-4230-b18e-ee1f663608e5";

async function main() {
  const supabase = getServiceSupabase();
  const { data: fileRow, error } = await supabase
    .from("ingest_email_files")
    .select("id, filename, parse_status, parse_outcome, parse_reason, parse_error")
    .eq("id", FILE_ID)
    .maybeSingle();

  if (error) throw error;
  if (!fileRow) {
    console.error(`File not found: ${FILE_ID}`);
    process.exit(1);
  }

  console.log(`Reprocessing ${fileRow.id} (${fileRow.filename}) status=${fileRow.parse_status}`);
  const result = await reprocessIngestEmailFile(fileRow.id, TENANT_ID);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
