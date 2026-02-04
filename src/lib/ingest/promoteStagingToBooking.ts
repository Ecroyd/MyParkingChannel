/**
 * Promote a single booking_import_staging row to public.bookings.
 * Reuses the same logic as parseEmailFile (attachment pipeline) so text emails and attachments behave identically.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapStagingToBookings } from "@/lib/imports/mapToBookings";

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
  const payload = {
    ...mapped,
    start_at: startAtParsed,
    end_at: endAtParsed,
    // Flyparks text email: pass through email from raw_json when present
    ...(stagingRow.raw_json?.extracted?.email
      ? { customer_email: stagingRow.raw_json.extracted.email }
      : {}),
  };

  const { data: existing, error: probeErr } = await supabase
    .from("bookings")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("dedupe_key", stagingRow.dedupe_key)
    .maybeSingle();

  if (probeErr) {
    return { ok: false, error: probeErr.message };
  }

  if (existing) {
    const { error: updateErr } = await supabase
      .from("bookings")
      .update(payload)
      .eq("id", existing.id)
      .eq("tenant_id", tenantId);
    if (updateErr) {
      return { ok: false, error: updateErr.message };
    }
    return { ok: true, updated: true, bookingId: existing.id };
  }

  // Fallback: check by reference
  const { data: byRef } = await supabase
    .from("bookings")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("reference", stagingRow.reference)
    .maybeSingle();

  if (byRef) {
    const { error: updateErr } = await supabase
      .from("bookings")
      .update(payload)
      .eq("id", byRef.id)
      .eq("tenant_id", tenantId);
    if (updateErr) {
      return { ok: false, error: updateErr.message };
    }
    return { ok: true, updated: true, bookingId: byRef.id };
  }

  // Skip insert if vehicle_reg is required and missing (match parseEmailFile behavior).
  // Allow Flyparks text emails to create bookings without a reg.
  const isFlyparksText = stagingRow.raw_json?.kind === "flyparks_text_email";
  const hasReg = stagingRow.vehicle_reg && String(stagingRow.vehicle_reg).trim() !== "" && stagingRow.vehicle_reg !== "-";
  if (!isFlyparksText && !hasReg) {
    return { ok: false, error: "Missing vehicle registration (required for new booking)" };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      ...payload,
      tenant_id: tenantId,
      source: stagingRow.source ?? "direct",
      external_source: stagingRow.raw_json?.kind === "flyparks_text_email" ? "flyparks_email_text" : null,
    })
    .select("id")
    .single();

  if (insertErr) {
    return { ok: false, error: insertErr.message };
  }
  return { ok: true, bookingId: inserted?.id };
}
