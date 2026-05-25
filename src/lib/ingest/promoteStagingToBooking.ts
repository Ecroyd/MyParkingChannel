/**
 * Promote a single booking_import_staging row to public.bookings.
 * Reuses the same logic as parseEmailFile (attachment pipeline) so text emails and attachments behave identically.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapStagingToBookings } from "@/lib/imports/mapToBookings";
import { safeBookingUpsertPayload } from "@/lib/ingest/safeBookingUpsertPayload";

export type PromoteResult = { ok: boolean; error?: string; updated?: boolean; bookingId?: string };

export async function promoteStagingRowToBooking(
  supabase: SupabaseClient,
  tenantId: string,
  dedupeKey: string
): Promise<PromoteResult> {
  const { data: stagingRow, error: fetchErr } = await supabase
    .from("booking_import_staging")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, error: fetchErr.message };
  }
  if (!stagingRow) {
    return { ok: false, error: "Staging row not found" };
  }

  const startAtRaw = stagingRow.start_at;
  const endAtRaw = stagingRow.end_at;
  if (!startAtRaw || !endAtRaw) {
    return { ok: false, error: "Missing start_at or end_at on staging row" };
  }

  const { data: tenantData } = await supabase
    .from("tenants")
    .select("timezone")
    .eq("id", tenantId)
    .single();
  const tz = tenantData?.timezone ?? "Europe/London";

  const { data: parsed, error: parseErr } = await supabase.rpc("normalise_booking_times", {
    p_start: startAtRaw,
    p_end: endAtRaw,
    p_tz: tz,
  });

  if (parseErr || !parsed?.length) {
    return { ok: false, error: parseErr?.message ?? "Invalid dates" };
  }

  let startAtParsed = parsed[0].start_utc ?? null;
  let endAtParsed = parsed[0].end_utc ?? null;
  if (!startAtParsed || !endAtParsed) {
    return { ok: false, error: "normalise_booking_times returned null" };
  }

  // bookings_time_window requires end_at > start_at
  const startMs = new Date(startAtParsed).getTime();
  const endMs = new Date(endAtParsed).getTime();
  if (endMs <= startMs) {
    const oneHour = 60 * 60 * 1000;
    endAtParsed = new Date(startMs + oneHour).toISOString();
  }

  const mapped = mapStagingToBookings(stagingRow);
  const source = stagingRow.source ?? "direct";
  const externalSource =
    stagingRow.raw_json?.kind === "flyparks_text_email"
      ? "flyparks_email_text"
      : stagingRow.raw_json?.channel === "APH"
        ? "aph"
        : null;

  const bookingRowRaw = {
    ...mapped,
    tenant_id: tenantId,
    source,
    reference: stagingRow.reference,
    start_at: startAtParsed,
    end_at: endAtParsed,
    status: mapped.status,
    external_status: mapped.external_status ?? null,
    external_source: externalSource,
    updated_at: new Date().toISOString(),
    ...(stagingRow.raw_json?.extracted?.email
      ? { customer_email: stagingRow.raw_json.extracted.email }
      : {}),
  };

  const safePayload = safeBookingUpsertPayload(bookingRowRaw);
  if (!safePayload.ok) {
    return { ok: false, error: safePayload.error };
  }
  const bookingRow = safePayload.data;

  // Skip insert/upsert if vehicle_reg is required and missing (match parseEmailFile behavior).
  const isFlyparksText = stagingRow.raw_json?.kind === "flyparks_text_email";
  const hasReg = stagingRow.vehicle_reg && String(stagingRow.vehicle_reg).trim() !== "" && stagingRow.vehicle_reg !== "-";
  if (!isFlyparksText && !hasReg) {
    return { ok: false, error: "Missing vehicle registration (required for new booking)" };
  }

  const { data: upserted, error: upsertErr } = await supabase
    .from("bookings")
    .upsert(bookingRow, {
      onConflict: "tenant_id,source,reference",
      ignoreDuplicates: false,
    })
    .select("id")
    .single();

  if (upsertErr) {
    return { ok: false, error: upsertErr.message };
  }
  return { ok: true, updated: true, bookingId: upserted?.id };
}
