/**
 * Resolve explicit tenant "New booking" notification recipients.
 *
 * Only addresses configured on tenant_email_settings are used.
 * Never fall back to reply_to, public profile, branding, or platform ops —
 * those caused Cloudflare-forwarded ops@ mail and broke multi-tenant isolation.
 */

export function isValidEmail(email: string | null | undefined): email is string {
  if (!email?.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
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

export type TenantBookingNotifySettings = {
  /** Preferred: tenant_email_settings.booking_notify_emails (text[]). */
  bookingNotifyEmails?: string[] | string | null;
  /** Legacy single column from earlier migration, if still present. */
  bookingNotifyEmail?: string | null;
};

/**
 * Recipients for internal "New booking — …" notifications.
 * Empty list = do not send (safe empty state).
 */
export function resolveTenantBookingNotifyEmails(
  settings: TenantBookingNotifySettings
): string[] {
  const fromArray = normalizeEmailList(settings.bookingNotifyEmails);
  if (fromArray.length > 0) return fromArray;
  return normalizeEmailList(settings.bookingNotifyEmail);
}
