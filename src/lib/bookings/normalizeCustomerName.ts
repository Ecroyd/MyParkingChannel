export function cleanName(value: string | null | undefined): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

/** Turn email local-part into a readable display name when safe. */
export function readableNameFromEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  let local = email.split("@")[0] ?? "";
  local = local.replace(/[+]/g, " ").replace(/[._-]+/g, " ").trim();
  local = local.replace(/\d+$/g, "").trim();
  const parts = local.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.every((p) => /^\d+$/.test(p))) return null;
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

export type ResolvedCustomerName = {
  name: string;
  missingCustomerName: boolean;
};

/**
 * Resolve a non-null customer_name for booking insert/update.
 * Priority: full name → surname/salutation → email local-part → "Unknown customer".
 */
export function resolveCustomerName(opts: {
  customerName?: string | null;
  customerLastName?: string | null;
  customerEmail?: string | null;
}): ResolvedCustomerName {
  const name =
    cleanName(opts.customerName) ||
    cleanName(opts.customerLastName) ||
    readableNameFromEmail(opts.customerEmail) ||
    "Unknown customer";

  return {
    name,
    missingCustomerName: name === "Unknown customer",
  };
}
