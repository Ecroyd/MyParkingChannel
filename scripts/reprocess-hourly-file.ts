/**
 * Find and reprocess 27_HOURLY_20260518_183043.csv
 * Usage: npx tsx scripts/reprocess-hourly-file.ts
 */
import "./loadEnvLocal";
import { getServiceSupabase } from "../src/lib/supabase/service";
import { parseEmailFile } from "../src/lib/ingest/parseEmailFile";

const FILENAME = "27_HOURLY_20260518_183043.csv";
const TENANT_ID = "bab45dab-19e8-4230-b18e-ee1f663608e5";

async function main() {
  const supabase = getServiceSupabase();
  const { data: fileRow, error } = await supabase
    .from("ingest_email_files")
    .select("id, filename, parse_reason, parse_error")
    .eq("filename", FILENAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!fileRow) {
    console.error(`File not found: ${FILENAME}`);
    process.exit(1);
  }

  console.log(`Reprocessing ${fileRow.id} (${fileRow.filename})`);
  const result = await parseEmailFile(fileRow.id, TENANT_ID);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
