import type { ParserKey } from "@/lib/importAttribution";
import { channelToParserKey, getAttribution } from "@/lib/importAttribution";
import { normalizeBookingSourceForDb } from "@/lib/bookings/normalizeBookingSource";

/** Platform id stored in bookings.external_source (not raw supplier status). */
export type ImportPlatformId =
  | "holiday_extras"
  | "aph"
  | "cavu"
  | "flyparks_email"
  | "parkvia"
  | "holiday_extras_extz10"
  | "unknown";

export type ImportPlatformAttribution = {
  /** bookings.source enum (Postgres booking_source) */
  bookingSource: string;
  /** Human/platform id in bookings.external_source */
  platformId: ImportPlatformId;
  parserKey: ParserKey;
};

const PLATFORM_BY_CHANNEL: Record<string, ImportPlatformAttribution> = {
  HOLIDAY_EXTRAS: {
    bookingSource: "holiday_extras",
    platformId: "holiday_extras",
    parserKey: "holiday_extras_email_import",
  },
  APH: {
    bookingSource: "aph",
    platformId: "aph",
    parserKey: "aph_email_import",
  },
  CAVU: {
    bookingSource: "cavu",
    platformId: "cavu",
    parserKey: "cavu_email_import",
  },
  FLYPARKS_EMAIL: {
    bookingSource: "other",
    platformId: "flyparks_email",
    parserKey: "flyparks_email_import",
  },
  PARKVIA_EMAIL: {
    bookingSource: "parkvia",
    platformId: "parkvia",
    parserKey: "parkvia_email_body",
  },
  HOLIDAY_EXTRAS_EXTZ10: {
    bookingSource: "holiday_extras",
    platformId: "holiday_extras_extz10",
    parserKey: "holiday_extras_extz10_tab",
  },
};

/**
 * Resolve source enum + external_source platform from parsed channel or parser key.
 */
export function resolveImportPlatform(opts: {
  channel?: string | null;
  parserKey?: ParserKey | null;
  stagingSource?: string | null;
}): ImportPlatformAttribution {
  const channel = (opts.channel ?? "").toUpperCase();
  if (channel && PLATFORM_BY_CHANNEL[channel]) {
    return PLATFORM_BY_CHANNEL[channel];
  }

  const parserKey =
    opts.parserKey ?? channelToParserKey(opts.channel ?? null);
  const attr = getAttribution(parserKey);

  const platformFromParser: ImportPlatformId =
    parserKey === "holiday_extras_email_import"
      ? "holiday_extras"
      : parserKey === "holiday_extras_extz10_tab"
        ? "holiday_extras_extz10"
      : parserKey === "aph_email_import"
        ? "aph"
        : parserKey === "cavu_email_import"
          ? "cavu"
          : parserKey === "flyparks_email_import"
            ? "flyparks_email"
            : parserKey === "parkvia_email_body"
              ? "parkvia"
            : "unknown";

  return {
    bookingSource: normalizeBookingSourceForDb(attr.bookingSource, {
      channel: opts.channel,
      externalSource: platformFromParser,
      parserKey,
    }),
    platformId: platformFromParser,
    parserKey,
  };
}
