/**
 * Reprocess ingest_email_files via parseEmailFile (staging + booking promotion).
 * Usage: npx tsx scripts/reprocess-import-files.ts
 */
import "./loadEnvLocal";
import { parseEmailFile } from "../src/lib/ingest/parseEmailFile";

const TENANT_ID = "bab45dab-19e8-4230-b18e-ee1f663608e5";
const FILE_IDS = [
  "bc966de8-36eb-4430-987f-d640f75be55b",
  "eba3ebc6-e911-48bf-b79b-8c1aaffec0a3",
];

async function main() {
  for (const fileId of FILE_IDS) {
    console.log(`\n=== Reprocessing ${fileId} ===`);
    const result = await parseEmailFile(fileId, TENANT_ID);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
