/**
 * Robust extraction of customer name / email / phone from direct-booking
 * customer-detail blocks (labelled or unlabeled, single- or multi-line).
 */

export const EMAIL_ADDRESS_PATTERN =
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/**
 * UK mobile/landline including spaces and +44.
 * Intentionally conservative so booking refs / times are not mistaken for phones.
 */
export const UK_PHONE_PATTERN =
  /(?:\+44\s*(?:\(0\)\s*)?|0)(?:\d[\s-]?){9,10}\d/g;

export type CustomerContactDetails = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

export function findEmailAddress(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(EMAIL_ADDRESS_PATTERN);
  if (!match) return null;
  const email = match[0];
  if (/@flyparks/i.test(email) || /noreply/i.test(email) || /@myparkingchannel\.app$/i.test(email)) {
    return null;
  }
  return email;
}

/** Normalize to digits (keeping leading + for international). */
export function normalizePhoneDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let cleaned = raw.replace(/[^\d+]/g, "");
  cleaned = cleaned.replace(/^\+440/, "+44");
  if (cleaned.startsWith("+44") && cleaned.length >= 12 && cleaned.length <= 14) {
    return cleaned;
  }
  if (/^0\d{9,10}$/.test(cleaned)) return cleaned;
  if (/^\d{10,11}$/.test(cleaned) && cleaned.startsWith("0")) return cleaned;
  if (cleaned.replace(/\D/g, "").length >= 10 && cleaned.replace(/\D/g, "").length <= 13) {
    return cleaned.length >= 8 ? cleaned : null;
  }
  return cleaned.length >= 8 ? cleaned : null;
}

export function findUkPhone(text: string | null | undefined): string | null {
  if (!text) return null;
  const matches = text.match(UK_PHONE_PATTERN);
  if (!matches?.length) return null;
  for (const raw of matches) {
    const normalized = normalizePhoneDigits(raw);
    if (normalized) return normalized;
  }
  return null;
}

export function customerNameLooksContaminated(name: string | null | undefined): boolean {
  if (!name) return false;
  return EMAIL_ADDRESS_PATTERN.test(name) || Boolean(name.match(UK_PHONE_PATTERN));
}

/**
 * Split a customer-details block into name / email / phone.
 * Prefer removing email and phone first; residual text becomes the name.
 */
export function splitCustomerDetailsBlock(
  block: string | null | undefined
): CustomerContactDetails {
  if (!block?.trim()) {
    return { name: null, email: null, phone: null };
  }

  let remaining = block.trim();

  const email = findEmailAddress(remaining);
  if (email) {
    remaining = remaining.replace(email, " ");
  }

  const phoneRaw = remaining.match(UK_PHONE_PATTERN)?.[0] ?? block.match(UK_PHONE_PATTERN)?.[0] ?? null;
  const phone = normalizePhoneDigits(phoneRaw);
  if (phoneRaw) {
    remaining = remaining.replace(phoneRaw, " ");
  }

  const name =
    remaining
      .replace(/[\r\n]+/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/^[\s,;:|\-/\\]+|[\s,;:|\-/\\]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim() || null;

  // Guard: never return a name that still embeds email/phone.
  if (name && customerNameLooksContaminated(name)) {
    const retry = splitCustomerDetailsBlock(name);
    return {
      name: retry.name && !customerNameLooksContaminated(retry.name) ? retry.name : null,
      email: email ?? retry.email,
      phone: phone ?? retry.phone,
    };
  }

  return { name, email, phone };
}

/**
 * Merge labelled fields with a free-text details block.
 * Labelled values win when present; the block fills gaps and cleans a bloated name.
 */
export function resolveCustomerContactDetails(input: {
  detailsBlock?: string | null;
  labeledName?: string | null;
  labeledEmail?: string | null;
  labeledPhone?: string | null;
  dearName?: string | null;
  bodyEmail?: string | null;
}): CustomerContactDetails {
  const fromBlock = splitCustomerDetailsBlock(input.detailsBlock ?? input.labeledName);

  const labeledEmail = findEmailAddress(input.labeledEmail) ?? (input.labeledEmail?.includes("@") ? input.labeledEmail.trim() : null);
  const labeledPhone = normalizePhoneDigits(input.labeledPhone);

  const email = labeledEmail || fromBlock.email || input.bodyEmail || null;
  const phone = labeledPhone || fromBlock.phone || null;

  // Prefer an explicit clean name; otherwise residual from the details block; else Dear-line.
  const nameCandidates = [
    fromBlock.name,
    splitCustomerDetailsBlock(input.labeledName).name,
    input.dearName?.trim() || null,
  ].filter(Boolean) as string[];

  const name =
    nameCandidates.find((n) => n && !customerNameLooksContaminated(n)) ?? null;

  return { name, email, phone };
}
