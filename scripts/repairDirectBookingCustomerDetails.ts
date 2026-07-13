/**
 * Preview (default) or apply safe repairs for direct bookings whose
 * customer_name contains an email/phone that should be split out.
 *
 * Usage:
 *   npx tsx scripts/repairDirectBookingCustomerDetails.ts
 *   npx tsx scripts/repairDirectBookingCustomerDetails.ts --tenant <tenant_id>
 *   npx tsx scripts/repairDirectBookingCustomerDetails.ts --apply
 *   npx tsx scripts/repairDirectBookingCustomerDetails.ts --tenant <id> --apply --limit 50
 *
 * Loads .env.local from project root if present.
 */

import "./loadEnvLocal";
import { getServiceSupabase } from "../src/lib/supabase/service";
import {
  applyDirectCustomerRepair,
  previewDirectCustomerRepairs,
} from "../src/lib/ingest/repairDirectBookingCustomerDetails";

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tenantId = argValue("--tenant");
  const limitRaw = argValue("--limit");
  const limit = limitRaw ? Number(limitRaw) : 2000;

  const supabase = getServiceSupabase();
  const previews = await previewDirectCustomerRepairs(supabase, {
    tenantId,
    limit: Number.isFinite(limit) ? limit : 2000,
  });

  const high = previews.filter((p) => p.confidence === "high");
  const low = previews.filter((p) => p.confidence !== "high");

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "preview",
        tenantId: tenantId ?? null,
        candidateCount: previews.length,
        highConfidenceCount: high.length,
        lowConfidenceCount: low.length,
        previews: previews.map((p) => ({
          id: p.booking.id,
          reference: p.booking.reference,
          tenant_id: p.booking.tenant_id,
          method: p.method,
          confidence: p.confidence,
          skipReason: p.skipReason,
          sourcePayloadAvailable: p.sourcePayloadAvailable,
          before: p.before,
          after: p.after,
        })),
      },
      null,
      2
    )
  );

  if (!apply) {
    console.error(
      `\nPreview only. ${high.length} high-confidence of ${previews.length} candidates. Re-run with --apply to update.`
    );
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const preview of high) {
    const result = await applyDirectCustomerRepair(supabase, preview);
    if (result.ok) {
      ok++;
      console.error(`Applied ${preview.booking.reference}`);
    } else {
      failed++;
      console.error(`Failed ${preview.booking.reference}: ${result.error}`);
    }
  }

  console.error(`\nApplied ${ok}, failed ${failed}, skipped low-confidence ${low.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
