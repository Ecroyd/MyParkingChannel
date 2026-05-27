/**
 * Single source of truth for import attribution mapping
 * 
 * This file defines the canonical mapping between:
 * - Parser keys (which parser successfully parsed the file)
 * - Booking sources (enum value for bookings.source)
 * - External sources (human-readable labels for UI/audit)
 * - Detected sources (internal identifiers)
 * 
 * All attribution logic should reference this file to ensure consistency.
 */

export type BookingSource =
  | "holiday_extras"
  | "holidayextras"
  | "aph"
  | "cavu"
  | "direct"
  | "other";

export type ParserKey =
  | "aph_email_import"
  | "holiday_extras_email_import"
  | "cavu_email_import"
  | "flyparks_email_import"
  | "unknown";

type Attribution = {
  bookingSource: BookingSource;
  externalSource: string; // what you show in UI/audit e.g. "APH Email Import"
  detectedSource: string; // e.g. "APH"
};

export const ATTRIBUTION_BY_PARSER: Record<ParserKey, Attribution> = {
  aph_email_import: {
    bookingSource: "aph",
    externalSource: "aph",
    detectedSource: "APH",
  },
  holiday_extras_email_import: {
    bookingSource: "holiday_extras",
    externalSource: "holiday_extras",
    detectedSource: "HOLIDAY_EXTRAS",
  },
  cavu_email_import: {
    bookingSource: "cavu",
    externalSource: "cavu",
    detectedSource: "CAVU",
  },
  flyparks_email_import: {
    bookingSource: "other",
    externalSource: "Flyparks Email Import",
    detectedSource: "FLYPARKS_EMAIL",
  },
  unknown: {
    bookingSource: "other",
    externalSource: "Unknown Import",
    detectedSource: "UNKNOWN",
  },
};

/**
 * Map a detected channel (from parser) to a parser key
 * This is used to determine which parser succeeded
 */
export function channelToParserKey(channel: string | null | undefined): ParserKey {
  if (!channel) return "unknown";
  
  const normalized = channel.toUpperCase();
  switch (normalized) {
    case "APH":
      return "aph_email_import";
    case "HOLIDAY_EXTRAS":
      return "holiday_extras_email_import";
    case "CAVU":
      return "cavu_email_import";
    case "FLYPARKS_EMAIL":
      return "flyparks_email_import";
    default:
      return "unknown";
  }
}

/**
 * Get attribution for a parser key
 */
export function getAttribution(parserKey: ParserKey): Attribution {
  return ATTRIBUTION_BY_PARSER[parserKey] || ATTRIBUTION_BY_PARSER.unknown;
}

/**
 * Validate that attribution matches expected values
 * Throws if there's a mismatch (prevents silent corruption)
 */
export function assertAttribution(
  parserKey: ParserKey,
  bookingSource: string,
  externalSource: string
): void {
  const expected = ATTRIBUTION_BY_PARSER[parserKey];
  if (!expected) {
    throw new Error(`Unknown parserKey: ${parserKey}`);
  }

  if (bookingSource !== expected.bookingSource || externalSource !== expected.externalSource) {
    throw new Error(
      `Attribution mismatch: parser=${parserKey} expected ${expected.bookingSource}/${expected.externalSource} got ${bookingSource}/${externalSource}`
    );
  }
}
