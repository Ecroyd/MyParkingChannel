/**
 * Backfill bookings from existing ingest_email_parses (Flyparks forwarded receipts).
 * Uses the same extraction logic as live ingest: Departure/Return dates & times from forwarded_text.
 *
 * Usage: npx tsx scripts/backfillFlyparksBookingsFromEmails.ts
 * Loads .env.local from project root if present.
 */

import "./loadEnvLocal";
import { getServiceSupabase } from "../src/lib/supabase/service";
import { upsertBookingFromFlyparksParse } from "../src/lib/ingest/flyparksBookingUpsert";

async function main() {
  const supabase = getServiceSupabase();

  // Fetch all ingest_email_parses that have a booking reference and forwarded text
  const { data: parses, error: parseErr } = await supabase
    .from("ingest_email_parses")
    .select(
      `
      id,
      ingest_email_id,
      forwarded_text,
      booking_plate_guess,
      booking_reference_guess,
      ingest_emails (
        id,
        to_address
      )
    `
    )
    .not("booking_reference_guess", "is", null)
    .not("forwarded_text", "is", null);

  if (parseErr) {
    console.error("Failed to fetch ingest_email_parses:", parseErr.message);
    process.exit(1);
  }

  const rows = parses ?? [];
  console.log(`Found ${rows.length} parse(s) with reference + forwarded_text.\n`);

  let ok = 0;
  let skipNoTenant = 0;
  let skipMissingDates = 0;
  let err = 0;

  for (const row of rows) {
    const email = Array.isArray(row.ingest_emails) ? row.ingest_emails[0] : row.ingest_emails;
    const toAddress = (email as { to_address?: string } | null)?.to_address ?? null;

    if (!toAddress) {
      console.warn(`Parse ${row.id}: no to_address on email, skipping.`);
      skipNoTenant++;
      continue;
    }

    const { data: inboxRow, error: inboxErr } = await supabase
      .from("tenant_inbound_inboxes")
      .select("tenant_id")
      .eq("to_address", toAddress)
      .maybeSingle();

    if (inboxErr) {
      console.error(`Parse ${row.id}: tenant inbox lookup failed:`, inboxErr.message);
      err++;
      continue;
    }

    const tenantId = inboxRow?.tenant_id ?? null;
    if (!tenantId) {
      console.warn(`Parse ${row.id}: no tenant for to_address ${toAddress}, skipping.`);
      skipNoTenant++;
      continue;
    }

    const result = await upsertBookingFromFlyparksParse(supabase, {
      tenantId,
      reference: String(row.booking_reference_guess),
      plate: row.booking_plate_guess ?? null,
      forwardedText: row.forwarded_text ?? "",
    });

    if (result.ok) {
      ok++;
      console.log(`OK  ref=${row.booking_reference_guess} tenant=${tenantId}`);
    } else {
      if (result.error?.includes("missing dates/times") || result.error?.includes("Invalid date")) {
        skipMissingDates++;
        console.warn(`Skip ref=${row.booking_reference_guess}: ${result.error}`);
      } else {
        err++;
        console.error(`ERR ref=${row.booking_reference_guess}: ${result.error}`);
      }
    }
  }

  console.log("\nDone.");
  console.log(`  Upserted: ${ok}`);
  console.log(`  Skipped (no tenant / to_address): ${skipNoTenant}`);
  console.log(`  Skipped (missing dates/times): ${skipMissingDates}`);
  console.log(`  Errors: ${err}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
