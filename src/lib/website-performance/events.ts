/**
 * First-party website conversion funnel event definitions.
 * Tenant-scoped; never include customer PII in payloads.
 */

export const FUNNEL_EVENT_NAMES = [
  "website_session",
  "availability_search",
  "availability_result",
  "booking_started",
  "customer_details_started",
  "checkout_started",
  "payment_started",
  "booking_completed",
  "booking_failed",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

/** Stages shown in the admin funnel visualisation (ordered). */
export const FUNNEL_DISPLAY_STAGES = [
  { key: "website_session", label: "Visitors", eventName: "website_session" as const },
  {
    key: "availability_search",
    label: "Availability searches",
    eventName: "availability_search" as const,
  },
  { key: "booking_started", label: "Booking starts", eventName: "booking_started" as const },
  { key: "checkout_started", label: "Checkout starts", eventName: "checkout_started" as const },
  {
    key: "booking_completed",
    label: "Completed bookings",
    eventName: "booking_completed" as const,
  },
] as const;

/** Events that may only be written by trusted server code (webhook / checkout). */
export const SERVER_ONLY_EVENTS: ReadonlySet<FunnelEventName> = new Set([
  "booking_completed",
  "booking_failed",
  "checkout_started",
  "payment_started",
]);

export const ATTRIBUTION_CHANNELS = [
  "organic",
  "direct",
  "referral",
  "paid",
  "social",
  "unknown",
] as const;

export type AttributionChannel = (typeof ATTRIBUTION_CHANNELS)[number];

export const DEVICE_CLASSES = ["mobile", "tablet", "desktop", "unknown"] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

/** Keys that must never appear in analytics meta / payloads. */
export const PII_PAYLOAD_KEYS = [
  "email",
  "customer_email",
  "customerEmail",
  "phone",
  "telephone",
  "customer_phone",
  "customerPhone",
  "name",
  "customer_name",
  "customerName",
  "full_name",
  "fullName",
  "plate",
  "vehicle_reg",
  "vehicleReg",
  "registration",
  "card",
  "card_number",
  "cardNumber",
  "cvc",
  "cvv",
  "pan",
  "payment_method",
  "paymentMethod",
] as const;

export function isFunnelEventName(value: unknown): value is FunnelEventName {
  return typeof value === "string" && (FUNNEL_EVENT_NAMES as readonly string[]).includes(value);
}

export function isAttributionChannel(value: unknown): value is AttributionChannel {
  return (
    typeof value === "string" && (ATTRIBUTION_CHANNELS as readonly string[]).includes(value)
  );
}
