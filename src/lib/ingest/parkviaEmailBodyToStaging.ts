import { normalizeFlyparksEmailText } from "@/lib/ingest/flyparksTextToStaging";
import { buildTenantLocalIso } from "@/lib/datetime/parse";

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
] as const;

const LABEL_PATTERN = LABELS.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

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

function pickLabel(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(?:^|\\n)\\s*${escaped}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${LABEL_PATTERN})\\s*:|$)`,
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
  const cleaned = value.replace(/\D/g, "");
  return cleaned || null;
}

function toLocalIso(value: string | null): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min] = m;
  return buildTenantLocalIso(`${dd}/${mm}/${yyyy}`, `${hh}:${min}`);
}

export function parkViaEmailBodyToStaging(rawText: string): ParkViaStaging {
  const text = normalizeFlyparksEmailText(rawText);
  const fields = Object.fromEntries(LABELS.map((label) => [label, pickLabel(text, label)]));

  const reference = fields["Booking Ref"]?.match(/[A-Z0-9-]{5,30}/i)?.[0]?.toUpperCase() ?? null;
  const selectedCarPark = fields["Selected Car Park"];
  const amountDue = parseMoney(fields["Amount Due"]);
  const passengers = fields.Passengers;
  const specialRequests = fields["Special Requests"];
  const bookingOptions = fields["Booking Options"];
  const totalPrice = parseMoney(fields["Total Price"]);
  const amountPaid = parseMoney(fields["Amount Paid"]);

  const noteParts = [
    selectedCarPark ? `Selected car park: ${selectedCarPark}` : null,
    amountDue != null ? `Amount due: ${amountDue.toFixed(2)}` : null,
    passengers ? `Passengers: ${passengers}` : null,
    specialRequests ? `Special requests: ${specialRequests}` : null,
  ].filter(Boolean);

  return {
    reference,
    customer_name: fields.Name,
    customer_email: fields.Email,
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
      },
      body_preview: text.slice(0, 1200),
    },
  };
}
