// src/lib/ingest/flyparksTextToStaging.ts
export type FlyparksStaging = {
  reference: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  start_at: string | null; // ISO string
  end_at: string | null;   // ISO string
  vehicle_reg: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_colour: string | null;
  flight_number: string | null;
  total_price: number | null;
  /** Same as total_price; used for bookings.money_charged / money_received (Charged £x) */
  money_charged: number | null;
  money_received: number | null;
  currency: string;
  product_code: string | null;
  raw_json: any;
};

// IMPORTANT: keep this dumb + robust. Emails are messy.
export function flyparksTextToStaging(forwardedText: string): FlyparksStaging {
  const text = forwardedText ?? "";

  const pick = (label: string) => {
    // matches: "Label:\nvalue" or "Label: value"
    const re = new RegExp(`${label}\\s*:\\s*\\n?\\s*(.+)`, "i");
    const m = text.match(re);
    if (!m) return null;
    const v = (m[1] ?? "").trim();
    if (!v || v === "." || v === "-" || v.toLowerCase() === "n/a") return null;
    return v;
  };

  const reference = pick("Reference");
  const name = pick("Your details");
  const email = (() => {
    const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m ? m[0].trim() : null;
  })();

  const phone = (() => {
    // loose UK-ish match
    const m = text.match(/(\+44\s?7\d{3}|\b07\d{3})\s?\d{3}\s?\d{3}\b/);
    return m ? m[0].replace(/\s+/g, "") : null;
  })();

  // Dates/times are in local UK format in these emails
  // "Departure date:" + "Arrival time:"   -> this is your START
  // "Return date:" + "Return time:"       -> this is your END
  const depDate = pick("Departure date");
  const arrTime = pick("Arrival time");
  const retDate = pick("Return date");
  const retTime = pick("Return time");

  const toIsoUtcFromLondon = (d: string | null, t: string | null) => {
    if (!d || !t) return null;
    // d expected DD/MM/YYYY, t expected HH:mm
    const dm = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const tm = t.match(/^(\d{2}):(\d{2})$/);
    if (!dm || !tm) return null;

    const [_, DD, MM, YYYY] = dm;
    const [__, hh, mm] = tm;

    // Build as Europe/London local then treat it as UTC by converting properly later in DB layer
    // We'll pass ISO without timezone and let DB interpret using tenant timezone in the importer,
    // OR you can convert in JS if you already have a tz helper.
    return `${YYYY}-${MM}-${DD}T${hh}:${mm}:00`;
  };

  const startLocalIso = toIsoUtcFromLondon(depDate, arrTime);
  const endLocalIso = toIsoUtcFromLondon(retDate, retTime);

  const plate = (() => {
    const v = pick("Vehicle registration");
    if (!v) return null;
    // accept only plate-like strings to avoid "BOOKING" etc
    const norm = v.toUpperCase().replace(/\s+/g, "");
    // rough UK plate sanity: 5-8 chars alnum
    if (!/^[A-Z0-9]{5,8}$/.test(norm)) return null;
    return norm;
  })();

  const totalCostRaw = pick("Total Cost") ?? pick("Parking Cost") ?? pick("Product Base Cost");
  const total_price = (() => {
    if (!totalCostRaw) return null;
    const normalized = totalCostRaw.replace(/,/g, "").trim();
    const m = normalized.match(/£\s*([0-9]+(?:\.[0-9]{1,2})?)/) ?? normalized.match(/([0-9]+(?:\.[0-9]{1,2})?)/);
    return m ? Number(m[1]) : null;
  })();
  const money_charged = total_price;
  const money_received = total_price;

  const product = pick("Product");

  return {
    reference,
    customer_name: name,
    customer_email: email,
    customer_phone: phone,
    start_at: startLocalIso,
    end_at: endLocalIso,
    vehicle_reg: plate,
    vehicle_make: pick("Vehicle make"),
    vehicle_model: pick("Vehicle model"),
    vehicle_colour: pick("Vehicle colour"),
    flight_number: pick("Return flight number"),
    total_price,
    money_charged,
    money_received,
    currency: "GBP",
    product_code: product,
    raw_json: {
      kind: "flyparks_text_email",
      extracted: {
        reference, name, email, phone, depDate, arrTime, retDate, retTime, totalCostRaw, product,
      },
    },
  };
}
