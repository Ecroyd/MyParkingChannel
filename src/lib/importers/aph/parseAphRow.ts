import { aphV1 } from "./mapping";

const trim = (s: unknown) => String(s ?? "").trim();

/**
 * Parse UK date/time format: dd/mm/yy and hh:mm
 * Returns UTC ISO string or null
 */
function parseDateTimeUK(ddmmyy: string, hhmm: string): string | null {
  const d = trim(ddmmyy);
  const t = trim(hhmm);

  // dd/mm/yy or dd/mm/yyyy
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;

  const tm = t.match(/^(\d{1,2}):(\d{2})$/);
  const hour = tm ? Number(tm[1]) : 0;
  const min = tm ? Number(tm[2]) : 0;

  // Create as Europe/London local time, convert to UTC ISO
  // For now, treat as UTC (you may want to use luxon for proper timezone handling)
  const date = new Date(Date.UTC(year, month - 1, day, hour, min, 0));
  return date.toISOString();
}

function parseMoney(x: string): number | null {
  const v = trim(x);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Parse a single APH CSV row into canonical staging format
 */
export function parseAphRow(row: string[]) {
  const c = aphV1.columns;

  // Ensure we have enough columns
  if (row.length < 33) {
    // Pad with empty strings if needed
    while (row.length < 33) {
      row.push("");
    }
  }

  const startAt = parseDateTimeUK(row[c.start_date] || "", row[c.start_time] || "");
  const endAt = parseDateTimeUK(row[c.end_date] || "", row[c.end_time] || "");

  const customerFirstName = trim(row[c.customer_first_name] || "");
  const customerLastName = trim(row[c.customer_last_name] || "");
  const customerName = [customerFirstName, customerLastName].filter(Boolean).join(" ").trim() || customerLastName;

  return {
    external_status: trim(row[c.external_status] || ""),
    external_reference: trim(row[c.external_reference] || ""),
    start_at: startAt,
    end_at: endAt,
    vehicle_reg: trim(row[c.vehicle_reg] || "") || null,
    vehicle_make: trim(row[c.vehicle_make] || "") || null,
    vehicle_colour: trim(row[c.vehicle_colour] || "") || null,
    customer_title: trim(row[c.customer_title] || "") || null,
    customer_first_name: customerFirstName || null,
    customer_last_name: customerLastName || null,
    customer_name: customerName || null,
    customer_phone: trim(row[c.customer_phone] || "") || null,
    return_flight_no: trim(row[c.return_flight_no] || "") || null,
    product_code: trim(row[c.product_code] || "") || null,
    total_price: parseMoney(row[c.total_price] || ""),
    currency: "GBP",
    raw_fields: row.map(trim),
  };
}
