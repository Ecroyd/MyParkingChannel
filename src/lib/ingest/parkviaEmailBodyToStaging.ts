import { normalizeFlyparksEmailText } from "@/lib/ingest/flyparksTextToStaging";
import { buildTenantLocalIso } from "@/lib/datetime/parse";
import {
  findEmailAddress,
  normalizePhoneDigits,
} from "@/lib/ingest/customerContactDetails";

export type ParkViaStaging = {
  reference: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  start_at: string | null;
  end_at: string | null;
  vehicle_reg: string | null;
  total_price: number | null;
  money_received: number | null;
  product_code: string | null;
  notes: string | null;
  raw_json: Record<string, unknown>;
};

const LABELS = [
  "Booking Ref",
  "Selected Car Park",
  "Total Price",
  "Amount Paid",
  "Amount Due",
  "Booking Options",
  "Vehicle Drop-Off Date",
  "Vehicle Pick-Up Date",
  "Passengers",
  "Name",
  "Mobile",
  "Email",
  "Registration Number",
  "Special Requests",
  "ANY SPECIAL REQUESTS",
] as const;

const LABEL_PATTERN = LABELS.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

/** Boundaries that must never be swallowed into a labelled value. */
const VALUE_STOP_PATTERN =
  "From|To|Cc|Date|Sent|Subject|Kind regards|Best regards|Regards|ParkVia|ParkCloud|https?://|www\\.";

export function looksLikeParkViaEmail(opts: {
  from_address?: string | null;
  subject?: string | null;
  body?: string | null;
}): boolean {
  const from = opts.from_address ?? "";
  const subject = opts.subject ?? "";
  const body = opts.body ?? "";
  return (
    /parkvia/i.test(from) ||
    /parkcloud/i.test(from) ||
    /ParkVia\s*-\s*Notification/i.test(subject) ||
    /ParkCloud\s*-\s*Notification/i.test(subject) ||
    /ParkVia\s*-\s*New Booking Notification/i.test(body) ||
    /ParkCloud\s*-\s*New Booking Notification/i.test(body) ||
    (/park(via|cloud)/i.test(body) && /booking\s+ref/i.test(body) && /registration\s+number/i.test(body))
  );
}

/**
 * ParkVia HTML/text often lands as one blob after tag stripping. Re-inject
 * newlines before known labels and common footer/header markers so pickLabel
 * can stop at field boundaries.
 */
export function normalizeParkViaEmailText(rawText: string): string {
  let text = normalizeFlyparksEmailText(rawText);

  text = text
    .replace(new RegExp(`\\b(${LABEL_PATTERN})\\s*:`, "gi"), "\n$1:")
    .replace(/\b(Kind regards|Best regards|Regards)\b/gi, "\n$1")
    .replace(/\b(ParkVia|ParkCloud)\s*-\s*(New Booking Notification|Notification)\b/gi, "\n$1 - $2")
    .replace(/\b(https?:\/\/[^\s]+)/gi, "\n$1")
    .replace(/\b(www\.[^\s]+)/gi, "\n$1")
    .replace(/^\s*(From|To|Cc|Date|Sent|Subject):\s*/gim, "\n$1: ");

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, idx, arr) => line.length > 0 || arr[idx - 1]?.length)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickLabel(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(?:^|\\n)\\s*${escaped}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${LABEL_PATTERN})\\s*:|\\n\\s*(?:${VALUE_STOP_PATTERN})\\b|$)`,
    "i"
  );
  const value = text.match(re)?.[1]?.trim().replace(/\n+/g, " ").replace(/[ \t]+/g, " ") ?? "";
  return value ? value : null;
}

function parseMoney(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizePlate(value: string | null): string | null {
  if (!value) return null;
  const plate = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return plate || null;
}

function cleanPhone(value: string | null): string | null {
  if (!value) return null;
  // Prefer digit run before (+44) style suffixes ParkVia appends.
  const beforeParen = value.split("(")[0]?.trim() ?? value;
  const normalized = normalizePhoneDigits(beforeParen);
  if (normalized) return normalized;
  const digits = beforeParen.replace(/\D/g, "");
  return digits || null;
}

function toLocalIso(value: string | null): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  return buildTenantLocalIso(`${dd}/${mm}/${yyyy}`, `${hh}:${min}`);
}

/**
 * Name is the field that historically swallowed ParkVia footers / HTML tails.
 * Keep only a short person-name shaped value.
 */
export function cleanParkViaCustomerName(value: string | null): string | null {
  if (!value) return null;

  let name = value.split(/\n/)[0]?.trim() ?? "";
  name = name
    .split(
      /\b(?:ParkVia|ParkCloud|Kind regards|Best regards|Regards|https?:\/\/|www\.|From|To|Cc|Date|Sent|Subject|Mobile|Email|Registration|Booking Ref|Notification|ANY SPECIAL REQUESTS)\b/i
    )[0]
    ?.trim() ?? "";

  name = name
    .replace(/[ \t]+/g, " ")
    .replace(/^[\s,;:|\-/\\]+|[\s,;:|\-/\\]+$/g, "")
    .trim();

  if (!name) return null;

  // Prefer letter words only (allows O'Brien / Anne-Marie).
  const words = name.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  if (words.length === 0) return null;
  name = words.slice(0, 5).join(" ");

  if (name.length > 80) return null;
  if (/parkvia|parkcloud|flyparks|notification|booking/i.test(name)) return null;
  if (findEmailAddress(name)) return null;

  return name || null;
}

export function parkViaEmailBodyToStaging(rawText: string): ParkViaStaging {
  const text = normalizeParkViaEmailText(rawText);
  const fields = Object.fromEntries(LABELS.map((label) => [label, pickLabel(text, label)]));

  const reference = fields["Booking Ref"]?.match(/[A-Z0-9-]{5,30}/i)?.[0]?.toUpperCase() ?? null;
  const selectedCarPark = fields["Selected Car Park"];
  const amountDue = parseMoney(fields["Amount Due"]);
  const passengers = fields.Passengers;
  const specialRequests = fields["Special Requests"] || fields["ANY SPECIAL REQUESTS"];
  const bookingOptions = fields["Booking Options"];
  const totalPrice = parseMoney(fields["Total Price"]);
  const amountPaid = parseMoney(fields["Amount Paid"]);
  const customerEmail = findEmailAddress(fields.Email) ?? (fields.Email?.includes("@") ? fields.Email.trim() : null);

  const noteParts = [
    selectedCarPark ? `Selected car park: ${selectedCarPark}` : null,
    amountDue != null ? `Amount due: ${amountDue.toFixed(2)}` : null,
    passengers ? `Passengers: ${passengers}` : null,
    specialRequests ? `Special requests: ${specialRequests}` : null,
  ].filter(Boolean);

  return {
    reference,
    customer_name: cleanParkViaCustomerName(fields.Name),
    customer_email: customerEmail,
    customer_phone: cleanPhone(fields.Mobile),
    start_at: toLocalIso(fields["Vehicle Drop-Off Date"]),
    end_at: toLocalIso(fields["Vehicle Pick-Up Date"]),
    vehicle_reg: normalizePlate(fields["Registration Number"]),
    total_price: totalPrice,
    money_received: amountPaid,
    product_code: bookingOptions || selectedCarPark,
    notes: noteParts.join("; ") || null,
    raw_json: {
      kind: "parkvia_email_body",
      parser_key: "parkvia_email_body",
      external_status: "new",
      fields,
      cleaned: {
        phone: cleanPhone(fields.Mobile),
        vehicle_reg: normalizePlate(fields["Registration Number"]),
        customer_name: cleanParkViaCustomerName(fields.Name),
      },
      body_preview: text.slice(0, 1200),
    },
  };
}
