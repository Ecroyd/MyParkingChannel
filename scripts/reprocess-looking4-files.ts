/**
 * Reprocess failed Looking4 OrdersPlacedToday CSV attachments.
 * Usage: npx tsx scripts/reprocess-looking4-files.ts
 */
import "./loadEnvLocal";
import { getServiceSupabase } from "../src/lib/supabase/service";
import { reprocessIngestEmailFile } from "../src/lib/ingest/reprocessIngestEmailFile";

const TENANT_ID = "bab45dab-19e8-4230-b18e-ee1f663608e5";
const FILE_IDS = [
  "90c09826-2248-4a91-8a47-b32c50de4e92", // OrdersPlacedToday_2356-20260805150044.csv
  "933f7339-259c-4605-9123-7a598c63dad4", // OrdersPlacedToday_2356-20260805140039.csv
  "9d42ad80-8028-4c0f-ac92-e79c63c3062b", // OrdersPlacedToday_2356-20260703200037.csv
];

async function main() {
  const supabase = getServiceSupabase();

  for (const fileId of FILE_IDS) {
    const { data: fileRow, error } = await supabase
      .from("ingest_email_files")
      .select("id, filename, parse_status, parse_outcome, parse_reason, parse_error")
      .eq("id", fileId)
      .maybeSingle();

    if (error) throw error;
    if (!fileRow) {
      console.error(`File not found: ${fileId}`);
      continue;
    }

    console.log(
      `\nReprocessing ${fileRow.id} (${fileRow.filename}) status=${fileRow.parse_status}`
    );
    try {
      const result = await reprocessIngestEmailFile(fileRow.id, TENANT_ID);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(`Failed ${fileRow.filename}:`, err);
    }
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, reference, source, external_source, status, vehicle_reg, start_at, end_at, customer_name")
    .eq("tenant_id", TENANT_ID)
    .ilike("reference", "JPL-1-7625802")
    .maybeSingle();

  console.log("\nBooking JPL-1-7625802:", booking ?? "not found");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
