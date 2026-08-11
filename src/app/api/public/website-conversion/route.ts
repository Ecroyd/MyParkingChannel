import { NextRequest, NextResponse } from "next/server";
import {
  SERVER_ONLY_EVENTS,
  isAttributionChannel,
  isFunnelEventName,
  type DeviceClass,
} from "@/lib/website-performance/events";
import { recordConversionEvent } from "@/lib/website-performance/recordEvent";
import { resolveTenantForPublicAnalytics } from "@/lib/website-performance/resolveTenantForPublic";
import { sanitizeAnalyticsMeta } from "@/lib/website-performance/sanitize";
import { allowFirstPartyClientAnalytics } from "@/lib/website-performance/consent";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Public ingest for first-party funnel events.
 * Tenant is resolved from Host / tenant_slug — never from client tenant_id.
 * booking_completed / booking_failed / checkout / payment are rejected here.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Explicitly ignore any client-supplied tenant_id
    if ("tenant_id" in body || "tenantId" in body) {
      delete (body as Record<string, unknown>).tenant_id;
      delete (body as Record<string, unknown>).tenantId;
    }

    const tenantSlug =
      typeof body.tenant_slug === "string"
        ? body.tenant_slug
        : typeof body.tenantSlug === "string"
          ? body.tenantSlug
          : null;

    const resolved = await resolveTenantForPublicAnalytics({
      host: req.headers.get("host"),
      tenantSlug,
    });

    if (!resolved) {
      return NextResponse.json({ error: "Tenant not resolved" }, { status: 400 });
    }

    if (!isFunnelEventName(body.event_name)) {
      return NextResponse.json({ error: "Invalid event_name" }, { status: 400 });
    }

    if (SERVER_ONLY_EVENTS.has(body.event_name)) {
      return NextResponse.json(
        { error: "Event must be recorded server-side" },
        { status: 403 }
      );
    }

    // Consent: load mode for this tenant's primary site when available
    let consentMode: string = "basic";
    try {
      const admin = createAdminClient();
      const { data: site } = await admin
        .from("sites")
        .select("id")
        .eq("slug", resolved.tenantSlug)
        .maybeSingle();
      if (site?.id) {
        const { data: seo } = await admin
          .from("site_seo_settings")
          .select("cookie_consent_mode")
          .eq("site_id", site.id)
          .maybeSingle();
        if (seo?.cookie_consent_mode) consentMode = seo.cookie_consent_mode;
      }
    } catch {
      /* default basic */
    }

    const hasConsent = body.consent === true || body.consent === "granted";
    if (!allowFirstPartyClientAnalytics(consentMode, hasConsent)) {
      return new NextResponse(null, { status: 204 });
    }

    const deviceClass = (
      ["mobile", "tablet", "desktop", "unknown"] as DeviceClass[]
    ).includes(body.device_class)
      ? (body.device_class as DeviceClass)
      : "unknown";

    const result = await recordConversionEvent({
      tenantId: resolved.tenantId,
      eventName: body.event_name,
      anonymousId: String(body.anonymous_id || ""),
      sessionId: String(body.session_id || ""),
      dedupeKey: String(body.dedupe_key || ""),
      landingPage: body.landing_page ?? null,
      referrer: body.referrer ?? null,
      deviceClass,
      source: body.source ?? body.utm_source ?? null,
      medium: body.medium ?? body.utm_medium ?? null,
      campaign: body.campaign ?? body.utm_campaign ?? null,
      utmSource: body.utm_source ?? null,
      utmMedium: body.utm_medium ?? null,
      utmCampaign: body.utm_campaign ?? null,
      utmTerm: body.utm_term ?? null,
      utmContent: body.utm_content ?? null,
      attributionChannel: isAttributionChannel(body.attribution_channel)
        ? body.attribution_channel
        : null,
      bookingValueCents:
        typeof body.booking_value_cents === "number" ? body.booking_value_cents : null,
      bookingCurrency: body.booking_currency ?? null,
      bookingReference: body.booking_reference ?? null,
      meta: sanitizeAnalyticsMeta(body.meta),
      serverTrusted: false,
    });

    if (!result.ok) {
      // Still 204 for soft failures so the booking UI never blocks on analytics
      if (result.status >= 500) {
        return new NextResponse(null, { status: 204 });
      }
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[public/website-conversion]", err);
    // Never break the visitor journey
    return new NextResponse(null, { status: 204 });
  }
}
