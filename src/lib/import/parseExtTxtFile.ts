// src/lib/import/parseExtTxtFile.ts
export async function parseExtTxtFile(f: File) {
  const text = await f.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows: any[] = [];

  for (const line of lines) {
    // Split by tab or >=2 spaces
    const cols = line.split(/\t+|\s{2,}/).map(v => v.replace(/"/g, "").trim());

    // Skip if it doesn't look like a valid row (needs ref + surname)
    if (!cols[2] || !cols[3]) continue;

    const arrivalDateRaw = safeGet(cols, 8);
    const arrivalTimeRaw = safeGet(cols, 7);
    const departDateRaw  = safeGet(cols, 13);
    const departTimeRaw  = safeGet(cols, 14);

    const customerFirstname = safeGet(cols, 5);
    const customerLastname = safeGet(cols, 3);
    const customerName = `${customerFirstname} ${customerLastname}`.trim();

    rows.push({
      source: safeGet(cols, 1),
      reference: safeGet(cols, 2),
      customer_name: customerName,
      customer_lastname: customerLastname,
      customer_title: safeGet(cols, 4),
      customer_firstname: customerFirstname,
      start_at: parseDate(arrivalDateRaw, arrivalTimeRaw),
      end_at: parseDate(departDateRaw, departTimeRaw),
      vehicle_reg: safeGet(cols, 15),
      vehicle_colour: safeGet(cols, 17),
      vehicle_make: safeGet(cols, 18),
      vehicle_model: safeGet(cols, 19),
      flight_number: safeGet(cols, 20),
      phone: normalizePhone(safeGet(cols, 21)),
      status: normalizeStatus(safeGet(cols, 10) || safeGet(cols, 11)),
      price: parseFloat(safeGet(cols, 12)) || 0,
      money_received: parseFloat(safeGet(cols, 13)) || 0,
      notes: buildNotes(cols)
    });
  }

  const headers = Object.keys(rows[0] ?? {});
  return { headers, rows };
}

function safeGet(arr: string[], i: number) {
  return (arr[i] ?? "").trim();
}

function parseDate(dateStr?: string, timeStr?: string) {
  if (!dateStr || !/^\d{6}$/.test(dateStr)) return null;
  const [d, m, y] = [dateStr.slice(0, 2), dateStr.slice(2, 4), "20" + dateStr.slice(4, 6)];
  const [h, min] = (timeStr || "00:00").split(":").map(Number);
  if (isNaN(h) || isNaN(min)) return null;
  return new Date(Date.UTC(+y, +m - 1, +d, h, min)).toISOString();
}

function normalizeStatus(raw: string) {
  const t = (raw || "").toLowerCase();

  // Channel feed patterns
  if (t.includes("canx")) return "cancelled";
  if (t.includes("firm")) return "reserved";
  if (t.includes("amnd")) return "reserved"; // treat amended as reserved (still active)
  if (t.includes("dep") || t.includes("out")) return "checked_out";
  if (t.includes("arr") || t.includes("in")) return "checked_in";

  // Default fallback
  return "reserved";
}

function normalizePhone(p: string) {
  return p.replace(/\s+/g, "").replace(/^0+/, "").replace(/^44?/, "0");
}

function buildNotes(cols: string[]) {
  const bits = [safeGet(cols, 9), safeGet(cols, 16), safeGet(cols, 17)]
    .filter(Boolean)
    .join(" / ");
  return bits || null;
}