/**
 * Resolve where tenant booking notifications should be delivered.
 * Platform ops addresses (ADMIN_NOTIFY_EMAIL / ops@myparkingchannel.app) are never used —
 * those are for delivery-failure alerts only, not parking-site booking alerts.
 */

export function isValidEmail(email: string | null | undefined): email is string {
  if (!email?.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function platformOpsEmails(
  envAdminNotify: string | null | undefined = process.env.ADMIN_NOTIFY_EMAIL
): Set<string> {
  const emails = new Set<string>(['ops@myparkingchannel.app']);
  const admin = envAdminNotify?.trim().toLowerCase();
  if (admin) emails.add(admin);
  return emails;
}

export function isTenantFacingNotifyEmail(
  email: string | null | undefined,
  opsEmails: Set<string> = platformOpsEmails()
): email is string {
  if (!isValidEmail(email)) return false;
  return !opsEmails.has(email.trim().toLowerCase());
}

export type TenantNotifyEmailSources = {
  /** Explicit booking notify override (tenant_email_settings.booking_notify_email). */
  bookingNotifyEmail?: string | null;
  /** Public profile / SEO contact email — preferred business inbox. */
  profileEmail?: string | null;
  /** Branding contact email. */
  brandingContactEmail?: string | null;
  /**
   * Reply-To for customer emails. Used only as a last resort for notifications,
   * and never when it is a platform ops address.
   */
  replyTo?: string | null;
};

/**
 * Pick the tenant inbox for "new booking" notifications (manual + website).
 * Priority: explicit notify → public profile → branding → reply-to (non-ops).
 */
export function resolveTenantBookingNotifyEmail(
  sources: TenantNotifyEmailSources,
  opsEmails: Set<string> = platformOpsEmails()
): string | null {
  const candidates = [
    sources.bookingNotifyEmail,
    sources.profileEmail,
    sources.brandingContactEmail,
    sources.replyTo,
  ];
  for (const candidate of candidates) {
    if (isTenantFacingNotifyEmail(candidate, opsEmails)) {
      return candidate.trim();
    }
  }
  return null;
}
