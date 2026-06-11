type ExtractInput = {
  subject: string;
  text: string;
};

import { normalizeFlyparksEmailText } from "@/lib/ingest/flyparksTextToStaging";

const normalize = (s: string) =>
  normalizeFlyparksEmailText(s);

/**
 * Extract the *actual* Flyparks booking receipt from a forwarded email.
 * Works on the text/plain of the parsed email.
 */
export function extractFlyparksReceiptFromForward(input: ExtractInput): string {
  const subject = (input.subject || "").trim();
  const text = normalize(input.text || "");

  const isFlyparksFw =
    /^fwd?:/i.test(subject) && /flyparks\s+(payment successful|booking confirmation)/i.test(subject);

  if (!isFlyparksFw) {
    // If it's not a forward, just return the whole text.
    return text.trim();
  }

  // Best marker: the receipt header
  const receiptMarker = "Booking Confirmation - ***BOOKING RECEIPT***";
  const idxReceipt = text.toLowerCase().indexOf(receiptMarker.toLowerCase());
  if (idxReceipt >= 0) {
    return text.slice(idxReceipt).trim();
  }

  // Fallback: find the second "From:" block (the *inner* email)
  // Your sample has:
  // 1) From: info@flyparksexeter.co.uk (forward wrapper)
  // 2) From: Flyparks Exeter Ltd Website <info@flyparksexeter.co.uk> (real receipt)
  const fromMatches = [...text.matchAll(/^\s*From:\s.*$/gim)];
  if (fromMatches.length >= 2) {
    const start = fromMatches[1].index ?? 0;
    return text.slice(start).trim();
  }

  // Final fallback: if we can find "Vehicle registration:" which is a stable field
  const idxVehicle = text.toLowerCase().indexOf("vehicle registration:");
  if (idxVehicle >= 0) {
    return text.trim();
  }

  return text.trim();
}

/**
 * Pull plate + numeric reference from the extracted receipt.
 * Plate in your case looks like UK format e.g. WD73ZHV.
 */
export function guessFlyparksFields(receipt: string): {
  plate?: string;
  reference?: string;
} {
  const plate =
    receipt.match(/\b([A-Z]{2}\d{2}[A-Z]{3})\b/)?.[1] ||
    receipt.match(/\b([A-Z0-9]{6,8})\b/)?.[1];

  const reference =
    receipt.match(/^\s*(?:Booking\s+)?Reference:\s*\n?\s*([A-Z0-9-]{3,20})\s*$/im)?.[1] ||
    receipt.match(/\b(?:Booking\s+)?Reference:\s*([A-Z0-9-]{3,20})\b/i)?.[1];

  return { plate, reference };
}
