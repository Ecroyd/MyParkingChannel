import { PII_PAYLOAD_KEYS } from "./events";

const PII_KEY_SET = new Set<string>(PII_PAYLOAD_KEYS.map((k) => k.toLowerCase()));

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
/** UK-ish plate pattern — strip rather than store. */
const PLATE_HINT_RE = /\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/gi;

/**
 * Deep-strip known PII keys and obvious PII-shaped strings from analytics payloads.
 * Returns a plain JSON-safe object.
 */
export function sanitizeAnalyticsMeta(input: unknown): Record<string, unknown> {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(input as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key || PII_KEY_SET.has(key.toLowerCase())) continue;

    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      const nested = sanitizeAnalyticsMeta(value);
      if (Object.keys(nested).length > 0) out[key] = nested;
      continue;
    }

    if (typeof value === "string") {
      const cleaned = value
        .replace(EMAIL_RE, "[redacted]")
        .replace(PHONE_RE, "[redacted]")
        .replace(PLATE_HINT_RE, "[redacted]")
        .slice(0, 500);
      if (cleaned) out[key] = cleaned;
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

export function payloadContainsPiiKeys(input: unknown): boolean {
  if (input == null || typeof input !== "object") return false;
  for (const key of Object.keys(input as Record<string, unknown>)) {
    if (PII_KEY_SET.has(key.toLowerCase())) return true;
    const value = (input as Record<string, unknown>)[key];
    if (value != null && typeof value === "object" && payloadContainsPiiKeys(value)) {
      return true;
    }
  }
  return false;
}
