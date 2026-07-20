import { buildTenantLocalIso } from '@/lib/datetime/parse';
import { resolveCustomerName } from '@/lib/bookings/normalizeCustomerName';
import {
  normalizePhoneDigits,
  resolveCustomerContactDetails,
} from '@/lib/ingest/customerContactDetails';
import { normalizeUkPlate } from '@/lib/ingest/plateGuess';
export type FlyparksStaging = {
  reference: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  start_at: string | null;
  end_at: string | null;
  vehicle_reg: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_colour: string | null;
  flight_number: string | null;
  total_price: number | null;
  money_charged: number | null;
  money_received: number | null;
  currency: string;
  product_code: string | null;
  raw_json: any;
};

export const FLYPARKS_DIRECT_MARKERS = [
  "Flyparks Payment Successful",
  "Flyparks Booking Confirmation",
  "Thank you for your booking with Flyparks",
  "Your transaction has been completed",
  "YOUR BOOKING REFERENCE",
  "Reference:",
  "Departure date:",
  "Arrival time:",
  "Return date:",
  "Return time:",
  "Drop off date",
  "Drop off time",
  "Pick up date",
  "Pick up time",
  "Vehicle Details",
  "Vehicle registration:",
] as const;

const FIELD_LABELS = [
  "YOUR BOOKING REFERENCE",
  "Your details",
  "Customer name",
  "Name",
  "Email",
  "Phone",
  "Telephone",
  "Contact number",
  "Mobile",
  "Departure date",
  "Departure Date",
  "Drop off date",
  "Drop Off Date",
  "Arrival time",
  "Arrival Time",
  "Drop off time",
  "Drop Off Time",
  "Return date",
  "Return Date",
  "Pick up date",
  "Pick Up Date",
  "Return time",
  "Return Time",
  "Pick up time",
  "Pick Up Time",
  "Departure flight number",
  "Return flight number",
  "Return Flight Number",
  "Vehicle make",
  "Vehicle model",
  "Vehicle Model",
  "Vehicle colour",
  "Vehicle Colour",
  "Vehicle registration",
  "Vehicle Registration",
  "Vehicle Details",
  "Reference",
  "Booking Reference",
  "Car Parking",
  "Parking Cost",
  "Total Cost",
  "Product Base Cost",
  "Product",
  "Days",
] as const;

const LABEL_PATTERN = FIELD_LABELS
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

export function normalizeFlyparksEmailText(input: string | null | undefined): string {
  let text = input ?? "";

  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/=\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  text = text
    .replace(/<(br|br\/|\/p|\/div|\/tr|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<(p|div|tr|li|h[1-6]|table|tbody|thead)\b[^>]*>/gi, "\n")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  text = decodeHtmlEntities(text);

  text = text
    .replace(/\*+\s*([^*\n:][^*\n]*?)\s*:\s*\*+/g, "$1:")
    .replace(/\*+\s*([^*\n:][^*\n]*?)\s*\*+(?=\s*:)/g, "$1")
    .replace(/\*\s*([A-Za-z][A-Za-z ]{1,40}:)\s*\*/g, "$1")
    .replace(/\*+([A-Z0-9][A-Z0-9 -]{2,30})\*+/gi, "$1")
    .replace(/^\s*>+\s?/gm, "")
    .replace(/^-{2,}\s*Forwarded message\s*-{2,}$/gim, "\n")
    .replace(/^Begin forwarded message:\s*$/gim, "\n")
    .replace(/^-{2,}\s*Original Message\s*-{2,}$/gim, "\n")
    .replace(/^\s*(From|To|Cc|Date|Subject):\s.*$/gim, "\n$&\n");

  text = text
    .replace(new RegExp(`\\b(${LABEL_PATTERN})\\s*:`, "gi"), "\n$1:")
    .replace(/\b(YOUR BOOKING REFERENCE):?\s+([A-Z0-9-]{3,20})\b/gi, "\n$1: $2")
    .replace(/\b(Drop off date|Drop off time|Pick up date|Pick up time):?\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}:\d{2})\b/gi, "\n$1: $2")
    .replace(/\b(Car Parking|Total Cost):?\s+(£|Â£)?\s*([0-9]+(?:\.[0-9]{1,2})?)\b/gi, "\n$1: £$3")
    .replace(/\b(Return flight number):?\s*$/gim, "\n$1: ");  // Handle empty return flight

  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, idx, arr) => line.length > 0 || arr[idx - 1]?.length)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function looksLikeFlyparksDirectEmail(subject: string | null | undefined, body: string | null | undefined): boolean {
  const haystack = `${subject ?? ""}\n${body ?? ""}`.toLowerCase();
  const markerHits = FLYPARKS_DIRECT_MARKERS.filter((marker) =>
    haystack.includes(marker.toLowerCase())
  ).length;

  if (/flyparks/i.test(subject ?? "") && /(payment successful|booking confirmation)/i.test(subject ?? "")) {
    return true;
  }

  // New format: ***BOOKING RECEIPT***
  if (haystack.includes("***booking receipt***") || haystack.includes("booking receipt")) {
    return true;
  }

  return markerHits >= 2 || (
    haystack.includes("flyparks") &&
    haystack.includes("reference:") &&
    haystack.includes("vehicle registration:")
  ) || (
    haystack.includes("flyparks") &&
    haystack.includes("your booking reference") &&
    (haystack.includes("drop off date") || haystack.includes("pick up date"))
  );
}

function pickLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `(?:^|\\n)\\s*${escaped}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${LABEL_PATTERN})\\s*:|\\n\\s*(?:From|To|Date|Subject):|$)`,
      "i"
    );
    const match = text.match(re);
    const value = match?.[1]?.trim().replace(/\n+/g, " ").replace(/[ \t]+/g, " ") ?? "";
    if (value && value !== "." && value !== "-" && value.toLowerCase() !== "n/a") {
      return value.replace(/[:;,]+$/, "").trim();
    }
  }
  return null;
}

function extractDate(value: string | null): string | null {
  if (!value) return null;
  return value.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/)?.[1] ?? null;
}

function extractTime(value: string | null): string | null {
  if (!value) return null;
  return value.match(/\b(\d{1,2}:\d{2})\b/)?.[1] ?? null;
}

const CUSTOMER_TITLES = /^(MR|MRS|MS|MISS|DR|SIR|MADAM|PROF|REV)\.?\s+/i;

function extractDearName(text: string): string | null {
  const m = text.match(/\bDear\s+([A-Za-z][A-Za-z' -]{0,40}?)\s*,/i);
  let name = m?.[1]?.trim() || null;
  if (name) {
    // Strip title prefix but preserve hyphenated surnames
    name = name.replace(CUSTOMER_TITLES, "").trim();
  }
  return name || null;
}

function extractForwardedCustomerEmail(text: string): string | null {
  const markers = [
    "Booking Confirmation",
    "Payment Successful",
    "YOUR BOOKING REFERENCE",
    "Your transaction has been completed",
  ];
  let start = 0;
  for (const marker of markers) {
    const idx = text.search(new RegExp(marker, "i"));
    if (idx >= 0) start = Math.max(start, idx);
  }

  const section = text.slice(start);
  const toLines = [...section.matchAll(/^\s*To:\s*(.+)$/gim)];
  for (const m of toLines) {
    const email =
      m[1].match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
    if (email && !/@flyparks/i.test(email) && !/noreply/i.test(email) && !/@myparkingchannel\.app$/i.test(email)) {
      return email;
    }
  }

  return null;
}

function parseMoney(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "");
  const match = normalized.match(/£\s*([0-9]+(?:\.[0-9]{1,2})?)/) ?? normalized.match(/\b([0-9]+(?:\.[0-9]{1,2})?)\b/);
  return match ? Number(match[1]) : null;
}

function toLocalIso(d: string | null, t: string | null): string | null {
  const date = extractDate(d);
  const time = extractTime(t);
  if (!date || !time) return null;
  return buildTenantLocalIso(date, time);
}

function splitVehicleModel(value: string | null): { make: string | null; model: string | null } {
  if (!value) return { make: null, model: null };
  const bits = value.trim().split(/\s+/).filter(Boolean);
  if (bits.length === 0) return { make: null, model: null };
  if (bits.length === 1) return { make: null, model: bits[0] };
  return { make: bits[0], model: bits.slice(1).join(" ") };
}

const VEHICLE_COLOURS = new Set([
  "beige",
  "black",
  "blue",
  "bronze",
  "brown",
  "cream",
  "gold",
  "green",
  "grey",
  "gray",
  "orange",
  "pink",
  "purple",
  "red",
  "silver",
  "white",
  "yellow",
]);

function parseVehicleDetails(value: string | null): {
  make: string | null;
  model: string | null;
  colour: string | null;
  registration: string | null;
} {
  if (!value) return { make: null, model: null, colour: null, registration: null };
  
  // Remove filler punctuation (dots, dashes, underscores) that appear before the plate
  const cleaned = value.replace(/[.\-_\s]+/g, " ").trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  
  const plateIndex = tokens.findLastIndex((token) => normalizeUkPlate(token) !== null);
  if (plateIndex < 0) {
    // Try harder: look for plate pattern in original string
    const plateMatch = value.match(/\b([A-Z]{2}\d{2}\s?[A-Z]{3})\b/i);
    if (plateMatch) {
      const registration = normalizeUkPlate(plateMatch[1]);
      return { make: null, model: null, colour: null, registration };
    }
    return { make: null, model: value.trim() || null, colour: null, registration: null };
  }

  const registration = normalizeUkPlate(tokens[plateIndex]);
  const beforePlate = tokens.slice(0, plateIndex);
  const possibleColour = beforePlate.at(-1);
  const colour = possibleColour && VEHICLE_COLOURS.has(possibleColour.toLowerCase()) ? possibleColour : null;
  const modelTokens = colour ? beforePlate.slice(0, -1) : beforePlate;
  const splitModel = splitVehicleModel(modelTokens.join(" "));

  return {
    make: splitModel.make,
    model: splitModel.model ?? (modelTokens.join(" ") || null),
    colour,
    registration,
  };
}

function extractPhone(text: string, explicitPhone: string | null): string | null {
  const raw =
    explicitPhone ??
    text.match(/(?:Phone|Telephone|Mobile|Contact number)\s*:\s*([+0-9 ()-]{8,})/i)?.[1] ??
    null;
  return normalizePhoneDigits(raw);
}

export function getFlyparksRequiredMissing(staging: Pick<FlyparksStaging, "reference" | "start_at" | "end_at" | "vehicle_reg">): string[] {
  return [
    !staging.reference ? "reference" : null,
    !staging.start_at ? "start_at" : null,
    !staging.end_at ? "end_at" : null,
    !staging.vehicle_reg ? "vehicle_reg" : null,
  ].filter(Boolean) as string[];
}

export function flyparksTextToStaging(rawText: string): FlyparksStaging {
  const text = normalizeFlyparksEmailText(rawText);

  const reference =
    pickLabel(text, ["Reference", "Booking Reference", "YOUR BOOKING REFERENCE"])?.match(/[A-Z0-9-]{3,20}/i)?.[0] ?? null;
  const dearName = extractDearName(text);
  const detailsBlock = pickLabel(text, ["Your details", "Customer name", "Name"]);
  const labeledEmail = pickLabel(text, ["Email"]);
  const labeledPhone = pickLabel(text, ["Phone", "Telephone", "Mobile", "Contact number"]);
  const forwardedToEmail = extractForwardedCustomerEmail(text);

  const contacts = resolveCustomerContactDetails({
    detailsBlock,
    labeledName: detailsBlock,
    labeledEmail,
    labeledPhone,
    dearName,
    bodyEmail: forwardedToEmail,
  });

  // Prefer labelled phone when present; otherwise phone extracted from the details block.
  const phone = extractPhone(text, labeledPhone) ?? contacts.phone;
  const email =
    contacts.email ??
    (() => {
      const found = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
      return (
        found.find(
          (e) =>
            !/@flyparks/i.test(e) &&
            !/noreply/i.test(e) &&
            !/@myparkingchannel\.app$/i.test(e)
        ) ?? null
      );
    })();

  const customerResolved = resolveCustomerName({
    customerName: contacts.name,
    customerLastName: dearName,
    customerEmail: email,
  });
  const customerName = customerResolved.name;

  const depDate = pickLabel(text, ["Departure date", "Departure Date", "Drop off date", "Drop Off Date"]);
  const arrTime = pickLabel(text, ["Arrival time", "Arrival Time", "Drop off time", "Drop Off Time"]);
  const retDate = pickLabel(text, ["Return date", "Return Date", "Pick up date", "Pick Up Date"]);
  const retTime = pickLabel(text, ["Return time", "Return Time", "Pick up time", "Pick Up Time"]);
  const startAt = toLocalIso(depDate, arrTime);
  const endAt = toLocalIso(retDate, retTime);

  const vehicleModelRaw = pickLabel(text, ["Vehicle model", "Vehicle Model"]);
  const vehicleDetails = parseVehicleDetails(pickLabel(text, ["Vehicle Details"]));
  const splitModel = splitVehicleModel(vehicleModelRaw);
  const vehicleMake = pickLabel(text, ["Vehicle make"]) ?? splitModel.make ?? vehicleDetails.make;
  const vehicleModel = splitModel.model ?? vehicleModelRaw ?? vehicleDetails.model;
  const vehicleColour = pickLabel(text, ["Vehicle colour", "Vehicle Colour"]) ?? vehicleDetails.colour;
  const vehicleRegistration =
    normalizeUkPlate(pickLabel(text, ["Vehicle registration", "Vehicle Registration"])) ??
    vehicleDetails.registration;
  
  // Prefer Total Cost, fall back to Car Parking
  const totalCostRaw = pickLabel(text, ["Total Cost"]) ?? pickLabel(text, ["Car Parking", "Parking Cost", "Product Base Cost"]);
  const totalPrice = parseMoney(totalCostRaw);

  const staging: FlyparksStaging = {
    reference,
    customer_name: customerName,
    customer_email: email,
    customer_phone: phone,
    start_at: startAt,
    end_at: endAt,
    vehicle_reg: vehicleRegistration,
    vehicle_make: vehicleMake,
    vehicle_model: vehicleModel,
    vehicle_colour: vehicleColour,
    flight_number: pickLabel(text, ["Return flight number", "Return Flight Number"]),
    total_price: totalPrice,
    money_charged: totalPrice,
    money_received: totalPrice,
    currency: "GBP",
    product_code: pickLabel(text, ["Product"]),
    raw_json: {
      kind: "flyparks_text_email",
      extracted: {
        reference,
        customerDetailsRaw: detailsBlock,
        customerName,
        dearName,
        email,
        customerNameResolved: customerName,
        customerNameMissing: customerResolved.missingCustomerName,
        phone,
        depDate,
        arrTime,
        retDate,
        retTime,
        returnFlightNumber: pickLabel(text, ["Return flight number", "Return Flight Number"]),
        vehicleModel: vehicleModelRaw,
        vehicleDetails: pickLabel(text, ["Vehicle Details"]),
        vehicleColour,
        vehicleRegistration,
        dateCandidates: Array.from(text.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)).map((match) => match[0]),
        plateCandidates: Array.from(text.matchAll(/\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/gi))
          .map((match) => normalizeUkPlate(match[0]))
          .filter(Boolean),
        parkingCost: pickLabel(text, ["Parking Cost"]),
        carParking: pickLabel(text, ["Car Parking"]),
        totalCost: pickLabel(text, ["Total Cost"]),
        product: pickLabel(text, ["Product"]),
      },
      // Preserve original ingest text for audit / repair (normalized form used for parse).
      source_text: text,
      missing_required: [],
      body_preview: text.slice(0, 1000),
    },
  };

  staging.raw_json.missing_required = getFlyparksRequiredMissing(staging);
  return staging;
}
