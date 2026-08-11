import { createAdminClient } from "@/lib/supabase/admin";
import {
  SERVER_ONLY_EVENTS,
  isAttributionChannel,
  isFunnelEventName,
  type AttributionChannel,
  type DeviceClass,
  type FunnelEventName,
} from "./events";
import { sanitizeAnalyticsMeta } from "./sanitize";

export type RecordConversionEventInput = {
  tenantId: string;
  eventName: FunnelEventName;
  anonymousId: string;
  sessionId: string;
  dedupeKey: string;
  occurredAt?: string;
  landingPage?: string | null;
  referrer?: string | null;
  deviceClass?: DeviceClass | null;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  attributionChannel?: AttributionChannel | null;
  bookingValueCents?: number | null;
  bookingCurrency?: string | null;
  bookingReference?: string | null;
  meta?: Record<string, unknown> | null;
  /** When true, allows server-only event names. */
  serverTrusted?: boolean;
};

export type RecordConversionEventResult =
  | { ok: true; inserted: boolean }
  | { ok: false; error: string; status: number };

function clip(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  if (!t) return null;
  return t.slice(0, max);
}

/**
 * Persist a conversion event. Never throws to callers for insert conflicts —
 * duplicates are treated as success (idempotent). Analytics failures return
 * ok:false so booking flows can ignore them.
 */
export async function recordConversionEvent(
  input: RecordConversionEventInput
): Promise<RecordConversionEventResult> {
  try {
    if (!input.tenantId || typeof input.tenantId !== "string") {
      return { ok: false, error: "tenant_id required", status: 400 };
    }
    if (!isFunnelEventName(input.eventName)) {
      return { ok: false, error: "invalid event_name", status: 400 };
    }
    if (!input.serverTrusted && SERVER_ONLY_EVENTS.has(input.eventName)) {
      return { ok: false, error: "event not allowed from client", status: 403 };
    }
    if (!input.anonymousId?.trim() || !input.sessionId?.trim() || !input.dedupeKey?.trim()) {
      return { ok: false, error: "anonymous_id, session_id and dedupe_key required", status: 400 };
    }

    const channel =
      input.attributionChannel && isAttributionChannel(input.attributionChannel)
        ? input.attributionChannel
        : null;

    const row = {
      tenant_id: input.tenantId,
      anonymous_id: clip(input.anonymousId, 80)!,
      session_id: clip(input.sessionId, 80)!,
      event_name: input.eventName,
      occurred_at: input.occurredAt || new Date().toISOString(),
      landing_page: clip(input.landingPage, 500),
      referrer: clip(input.referrer, 500),
      device_class: input.deviceClass || null,
      source: clip(input.source, 120),
      medium: clip(input.medium, 120),
      campaign: clip(input.campaign, 120),
      utm_source: clip(input.utmSource, 120),
      utm_medium: clip(input.utmMedium, 120),
      utm_campaign: clip(input.utmCampaign, 120),
      utm_term: clip(input.utmTerm, 120),
      utm_content: clip(input.utmContent, 120),
      attribution_channel: channel,
      booking_value_cents:
        typeof input.bookingValueCents === "number" && input.bookingValueCents >= 0
          ? Math.round(input.bookingValueCents)
          : null,
      booking_currency: clip(input.bookingCurrency, 8),
      booking_reference: clip(input.bookingReference, 64),
      dedupe_key: clip(input.dedupeKey, 200)!,
      meta: sanitizeAnalyticsMeta(input.meta ?? {}),
    };

    const admin = createAdminClient();
    const { error } = await admin.from("website_conversion_events").insert(row);

    if (error) {
      // Unique violation = duplicate / idempotent success
      if ((error as { code?: string }).code === "23505") {
        return { ok: true, inserted: false };
      }
      console.error("[website-performance] insert failed", error.message);
      return { ok: false, error: "insert failed", status: 500 };
    }

    return { ok: true, inserted: true };
  } catch (err) {
    console.error("[website-performance] recordConversionEvent", err);
    return { ok: false, error: "unexpected error", status: 500 };
  }
}

/** Fire-and-forget helper — never rejects. */
export function recordConversionEventSafe(input: RecordConversionEventInput): void {
  void recordConversionEvent(input).catch((err) => {
    console.error("[website-performance] safe record failed", err);
  });
}
