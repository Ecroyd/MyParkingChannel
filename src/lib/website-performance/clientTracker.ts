"use client";

import type { AttributionChannel, DeviceClass, FunnelEventName } from "./events";
import { SERVER_ONLY_EVENTS } from "./events";
import { classifyAttribution, detectDeviceClass } from "./attribution";
import {
  CONSENT_COOKIE_NAME,
  CONSENT_STORAGE_KEY,
  allowFirstPartyClientAnalytics,
} from "./consent";

const ANON_KEY = "pc_anon_id";
const SESSION_KEY = "pc_session_id";
const SESSION_FIRED_KEY = "pc_session_fired";
const DEDUPE_PREFIX = "pc_funnel_dedupe:";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function hasConsentFlag(): boolean {
  try {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (v === "1" || v === "granted" || v === "true") return true;
    }
  } catch {
    /* ignore */
  }
  const c = readCookie(CONSENT_COOKIE_NAME);
  return c === "1" || c === "granted" || c === "true";
}

function getOrCreate(storage: Storage, key: string): string {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const id = randomId();
    storage.setItem(key, id);
    return id;
  } catch {
    return randomId();
  }
}

export function getAnonymousId(): string {
  if (typeof window === "undefined") return "server";
  try {
    return getOrCreate(window.localStorage, ANON_KEY);
  } catch {
    return getOrCreate(window.sessionStorage, ANON_KEY);
  }
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  return getOrCreate(window.sessionStorage, SESSION_KEY);
}

function alreadyFired(dedupeKey: string): boolean {
  try {
    return window.sessionStorage.getItem(DEDUPE_PREFIX + dedupeKey) === "1";
  } catch {
    return false;
  }
}

function markFired(dedupeKey: string): void {
  try {
    window.sessionStorage.setItem(DEDUPE_PREFIX + dedupeKey, "1");
  } catch {
    /* ignore */
  }
}

function parseUtm(): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
} {
  if (typeof window === "undefined") {
    return {
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
    };
  }
  const sp = new URLSearchParams(window.location.search);
  return {
    utmSource: sp.get("utm_source"),
    utmMedium: sp.get("utm_medium"),
    utmCampaign: sp.get("utm_campaign"),
    utmTerm: sp.get("utm_term"),
    utmContent: sp.get("utm_content"),
  };
}

export type ClientTrackOptions = {
  tenantSlug: string;
  cookieConsentMode?: string | null;
  bookingValueCents?: number;
  bookingCurrency?: string;
  bookingReference?: string;
  meta?: Record<string, unknown>;
  /** Override dedupe key; defaults to session+event for once-per-session stages. */
  dedupeKey?: string;
  /** Allow re-firing the same logical stage (e.g. multiple searches). */
  allowRepeat?: boolean;
};

/**
 * Emit a client-side funnel event. Never throws. Never sends PII.
 * Server-only events are rejected locally.
 */
export function trackFunnelEvent(
  eventName: FunnelEventName,
  options: ClientTrackOptions
): void {
  if (typeof window === "undefined") return;
  if (SERVER_ONLY_EVENTS.has(eventName)) return;
  if (!allowFirstPartyClientAnalytics(options.cookieConsentMode, hasConsentFlag())) return;

  const sessionId = getSessionId();
  const anonymousId = getAnonymousId();
  const dedupeKey =
    options.dedupeKey ||
    (options.allowRepeat
      ? `${sessionId}:${eventName}:${Date.now()}`
      : `${sessionId}:${eventName}`);

  if (!options.allowRepeat && alreadyFired(dedupeKey)) return;
  markFired(dedupeKey);

  const utm = parseUtm();
  const referrer = document.referrer || null;
  const landingPage = `${window.location.pathname}${window.location.search}`.slice(0, 500);
  const deviceClass: DeviceClass = detectDeviceClass(navigator.userAgent);
  const attributionChannel: AttributionChannel | null = classifyAttribution({
    utmSource: utm.utmSource,
    utmMedium: utm.utmMedium,
    utmCampaign: utm.utmCampaign,
    referrer,
    landingPage,
  });

  const body = {
    tenant_slug: options.tenantSlug,
    event_name: eventName,
    anonymous_id: anonymousId,
    session_id: sessionId,
    dedupe_key: dedupeKey,
    landing_page: landingPage,
    referrer,
    device_class: deviceClass,
    source: utm.utmSource,
    medium: utm.utmMedium,
    campaign: utm.utmCampaign,
    utm_source: utm.utmSource,
    utm_medium: utm.utmMedium,
    utm_campaign: utm.utmCampaign,
    utm_term: utm.utmTerm,
    utm_content: utm.utmContent,
    attribution_channel: attributionChannel,
    booking_value_cents: options.bookingValueCents ?? null,
    booking_currency: options.bookingCurrency ?? null,
    booking_reference: options.bookingReference ?? null,
    meta: options.meta ?? {},
    consent: hasConsentFlag(),
  };

  const payload = JSON.stringify(body);
  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/public/website-conversion", blob);
      if (ok) return;
    }
  } catch {
    /* fall through */
  }

  void fetch("/api/public/website-conversion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    /* never block UX */
  });
}

/** Fire website_session once per browser session. */
export function trackWebsiteSession(
  tenantSlug: string,
  cookieConsentMode?: string | null
): void {
  if (typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem(SESSION_FIRED_KEY) === "1") return;
    window.sessionStorage.setItem(SESSION_FIRED_KEY, "1");
  } catch {
    /* continue */
  }
  trackFunnelEvent("website_session", { tenantSlug, cookieConsentMode });
}
