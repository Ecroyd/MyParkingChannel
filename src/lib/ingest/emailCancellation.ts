import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supplier emails (Flyparks receipts, ParkVia notifications) were always promoted as
 * RESERVED, so a cancellation email re-reserved the booking. The subject line is the most
 * reliable signal these senders give us.
 */
export function isCancellationSubject(subject: string | null | undefined): boolean {
  if (!subject) return false;
  const s = subject.toLowerCase();
  // Questions ("can I cancel?") and confirmations that mention cancellation terms are not
  // cancellations. A false positive is worse than a miss here: it cancels a live booking.
  if (s.includes("?")) return false;
  if (
    /\bnot\s+(?:been\s+)?cancel/.test(s) ||
    /\bfree\s+cancel/.test(s) ||
    /\bcancel+ation\s+(?:polic|terms|cover|insurance|protection|guarantee)/.test(s) ||
    /\b(?:how\s+to|can\s+i|want\s+to|wish\s+to|request(?:ing)?\s+to)\s+cancel/.test(s)
  ) {
    return false;
  }
  return /\bcancel+(?:ed|ation)\b/.test(s) || /\bcanx\b/.test(s) || /\bbooking\s+cancel/.test(s);
}

export type EmailCancellationResult =
  | { ok: true; bookingId: string; alreadyCancelled: boolean }
  | { ok: false; error: string };

/**
 * Cancel the booking a supplier cancellation email refers to. Only needs the reference,
 * because cancellation emails often omit dates/plate that a full upsert would require.
 */
export async function cancelBookingFromEmail(
  supabase: SupabaseClient,
  params: { tenantId: string; reference: string; sources: string[] }
): Promise<EmailCancellationResult> {
  const { tenantId, reference, sources } = params;
  const { data: rows, error } = await supabase
    .from("bookings")
    .select("id, status, source")
    .eq("tenant_id", tenantId)
    .eq("reference", reference);

  if (error) return { ok: false, error: `cancellation lookup failed: ${error.message}` };

  // Prefer the booking from the same channel when a reference exists on more than one.
  const candidates = rows ?? [];
  const match =
    candidates.find((r) => sources.includes(String(r.source))) ??
    (candidates.length === 1 ? candidates[0] : null);

  if (!match) {
    return {
      ok: false,
      error:
        candidates.length > 1
          ? `cancellation email for reference ${reference} matches ${candidates.length} bookings from other channels; not applied`
          : `cancellation email for unknown reference ${reference}`,
    };
  }

  if (match.status === "cancelled") return { ok: true, bookingId: match.id, alreadyCancelled: true };

  const { error: updErr } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      external_status: "cancelled",
      gate_status: "cancelled",
      ops_status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", match.id)
    .eq("tenant_id", tenantId);

  if (updErr) return { ok: false, error: `cancellation update failed: ${updErr.message}` };
  return { ok: true, bookingId: match.id, alreadyCancelled: false };
}
