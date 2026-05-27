/**
 * Shared Flyparks receipt extraction + booking upsert.
 * Used by: /api/ingest/email (live ingest) and scripts/backfillFlyparksBookingsFromEmails.ts (backfill).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeBookingUpsertPayload } from "@/lib/ingest/safeBookingUpsertPayload";

export function match1(text: string, re: RegExp): string | null {
  return text.match(re)?.[1]?.trim() ?? null;
}

function parseMoneyToNumber(raw: string | null): number | null {
  if (!raw) return null;
  let s = raw
    .replace(/(GBP|gbp|pounds|pound|£)/g, "")
    .trim();

  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/,/g, "");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }

  s = s.replace(/[^\d.]/g, "");
  if (!s) return null;

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function extractFlyparksAmount(text: string): number | null {
  const patterns: RegExp[] = [
    /(?:total\s*(?:paid)?|amount\s*(?:paid)?|paid|charge(?:d)?|transaction\s*amount)\s*[:\-]?\s*(£?\s*[\d,]+(?:\.\d{2})?)/i,
    /(?:£\s*[\d,]+(?:\.\d{2})?)/i,
    /\bGBP\s*([\d,]+(?:\.\d{2})?)\b/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;

    const raw = (m[1] ?? m[0])?.trim() ?? null;
    const n = parseMoneyToNumber(raw);

    if (n !== null && n >= 1 && n <= 5000) return n;
  }

  return null;
}

export function toUtcFromUkDateTime(d: string, t: string): string | null {
  // d: DD/MM/YYYY, t: HH:MM
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = m[1],
    mm = m[2],
    yyyy = m[3];
  return new Date(`${yyyy}-${mm}-${dd}T${t}:00Z`).toISOString();
}

export type FlyparksBookingUpsertOpts = {
  tenantId: string;
  reference: string;
  plate: string | null;
  forwardedText: string;
};

/**
 * Extract Flyparks receipt fields (Departure/Return dates & times, email, phone, name)
 * and upsert into bookings. Same logic as live ingest.
 */
export async function upsertBookingFromFlyparksParse(
  supabaseAdmin: SupabaseClient,
  opts: FlyparksBookingUpsertOpts
): Promise<{ ok: boolean; error?: string }> {
  const text = opts.forwardedText;

  const depDate = match1(text, /Departure date:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const arrTime = match1(text, /Arrival time:\s*(\d{2}:\d{2})/i);
  const retDate = match1(text, /Return date:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const retTime = match1(text, /Return time:\s*(\d{2}:\d{2})/i);

  if (!depDate || !arrTime || !retDate || !retTime) {
    return { ok: false, error: "Flyparks parse missing dates/times" };
  }

  const startAt = toUtcFromUkDateTime(depDate, arrTime);
  const endAt = toUtcFromUkDateTime(retDate, retTime);
  if (!startAt || !endAt) {
    return { ok: false, error: "Invalid date/time format" };
  }

  const email = match1(text, /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  const phone = match1(text, /(\+?\d[\d\s]{8,})/);

  const name =
    match1(text, /Your details:\s*([\s\S]{0,60})\n/i)?.split("\n")[0]?.trim() ||
    "Flyparks Customer";

  const amount = extractFlyparksAmount(text);

  const payload: Record<string, unknown> = {
    tenant_id: opts.tenantId,
    reference: opts.reference,
    plate: opts.plate,
    customer_name: name,
    customer_email: email,
    customer_phone: phone,
    start_at: startAt,
    end_at: endAt,
    source: "direct",
    status: "reserved",
  };

  if (amount !== null) {
    payload.money_charged = amount;
    payload.money_received = amount;
  }

  const safePayload = safeBookingUpsertPayload(payload);
  if (!safePayload.ok) {
    return { ok: false, error: safePayload.error };
  }

  const { error } = await supabaseAdmin
    .from("bookings")
    .upsert(safePayload.data, {
      onConflict: "tenant_id,reference",
      ignoreDuplicates: false,
    });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
