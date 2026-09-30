/**
 * Resolve explicit tenant "New booking" notification recipients.
 *
 * Only addresses configured on tenant_email_settings are used.
 * Never fall back to reply_to, public profile, branding, or platform ops —
 * those caused Cloudflare-forwarded ops@ mail and broke multi-tenant isolation.
 *
 * Never allow platform Cloudflare ingest addresses (bookings@ / canary-bookings@):
 * Resend To: those addresses is re-ingested by the Email Worker and will not
 * create bookings or reach a human mailbox.
 */

export function isValidEmail(email: string | null | undefined): email is string {
  if (!email?.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Cloudflare Email Routing ingest inboxes — must never be Resend notify recipients. */
export const PLATFORM_INGEST_EMAILS = [
  'bookings@myparkingchannel.app',
  'canary-bookings@myparkingchannel.app',
] as const;

export function isPlatformIngestEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const normalized = email.trim().toLowerCase();
  return (PLATFORM_INGEST_EMAILS as readonly string[]).includes(normalized);
}

export function platformIngestEmailSet(): Set<string> {
  return new Set(PLATFORM_INGEST_EMAILS.map((e) => e.toLowerCase()));
}

/** Split a free-text field (commas / whitespace / newlines) into unique valid emails. */
export function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const email = part.trim();
    if (!isValidEmail(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

export function normalizeEmailList(
  value: string[] | string | null | undefined
): string[] {
  if (Array.isArray(value)) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of value) {
      if (!isValidEmail(item)) continue;
      const key = item.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item.trim());
    }
    return out;
  }
  return parseEmailList(value);
}

/**
 * Drop platform ingest addresses from a notify list.
 * Returns { allowed, blocked } so callers can surface a clear error.
 */
export function partitionBookingNotifyEmails(
  value: string[] | string | null | undefined
): { allowed: string[]; blocked: string[] } {
  const all = normalizeEmailList(value);
  const allowed: string[] = [];
  const blocked: string[] = [];
  for (const email of all) {
    if (isPlatformIngestEmail(email)) {
      blocked.push(email);
    } else {
      allowed.push(email);
    }
  }
  return { allowed, blocked };
}

export type TenantBookingNotifySettings = {
  /** Preferred: tenant_email_settings.booking_notify_emails (text[]). */
  bookingNotifyEmails?: string[] | string | null;
  /** Legacy single column from earlier migration, if still present. */
  bookingNotifyEmail?: string | null;
};

/**
 * Recipients for internal "New booking — …" notifications.
 * Empty list = do not send (safe empty state).
 * Platform ingest addresses are always stripped.
 */
export function resolveTenantBookingNotifyEmails(
  settings: TenantBookingNotifySettings
): string[] {
  const fromArray = partitionBookingNotifyEmails(settings.bookingNotifyEmails).allowed;
  if (fromArray.length > 0) return fromArray;
  return partitionBookingNotifyEmails(settings.bookingNotifyEmail).allowed;
}
