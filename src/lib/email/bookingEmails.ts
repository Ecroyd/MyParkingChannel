import { createAdminClient } from "@/lib/supabase/server-admin";
import { queueEmail } from "@/lib/email/emailService";
import { resolvePrimaryCanonicalHost, buildAbsoluteUrl } from "@/lib/seo/canonical";
import type { DomainCandidate } from "@/lib/seo/canonical";
import { formatAddressLines } from "@/lib/seo/public-address";
import {
  isValidEmail,
  resolveTenantBookingNotifyEmails,
} from "@/lib/email/tenantNotifyEmail";

export type QueueBookingEmailsInput = {
  tenantId: string;
  bookingId: string;
  bookingReference: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  plate: string;
  flightNumber?: string | null;
  startAt: string;
  endAt: string;
  amount: number;
  currency?: string;
  source?: string | null;
  /**
   * When true, skip the one-shot confirmation dedupe key so staff can resend.
   * Still avoids accidental double-queue within the same second via a unique suffix.
   */
  forceResend?: boolean;
  /** Customer confirmation only (skip tenant notify). Default false. */
  customerOnly?: boolean;
};

type TenantEmailSettingsRow = {
  reply_to?: string | null;
  from_name?: string | null;
  booking_notify_emails?: string[] | null;
  booking_notify_email?: string | null;
};

async function resolveTenantNotifyContext(tenantId: string) {
  const admin = createAdminClient();

  const [
    { data: tenant },
    { data: emailSettings },
    { data: profile },
    { data: branding },
    { data: domains },
    { data: site },
  ] = await Promise.all([
    admin.from("tenants").select("name, slug").eq("id", tenantId).maybeSingle(),
    admin
      .from("tenant_email_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    admin
      .from("tenant_public_profile")
      .select("business_name, email, phone, address, county, country")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    admin
      .from("tenant_branding")
      .select("app_name, contact_email, contact_phone")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    admin
      .from("tenant_domains")
      .select("id, domain, is_primary, verified, tenant_id")
      .eq("tenant_id", tenantId),
    admin
      .from("sites")
      .select("primary_domain")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const settings = emailSettings as TenantEmailSettingsRow | null;

  const tenantName =
    profile?.business_name?.trim() ||
    branding?.app_name?.trim() ||
    tenant?.name?.trim() ||
    "Airport Parking";

  // Explicit list only — never reply_to / profile / branding / platform ops.
  const notifyEmails = resolveTenantBookingNotifyEmails({
    bookingNotifyEmails: settings?.booking_notify_emails,
    bookingNotifyEmail: settings?.booking_notify_email,
  });

  const contactEmail =
    [profile?.email, branding?.contact_email, settings?.reply_to]
      .map((e) => e?.trim())
      .find((e) => isValidEmail(e)) || null;

  const contactPhone =
    profile?.phone?.trim() || branding?.contact_phone?.trim() || null;

  const host =
    resolvePrimaryCanonicalHost((domains ?? []) as DomainCandidate[], {
      sitePrimaryDomain: site?.primary_domain,
    }) ||
    (tenant?.slug ? `${tenant.slug}.myparkingchannel.app` : null);

  const siteUrl = host ? buildAbsoluteUrl(host, "/") : null;
  const manageBookingUrl = host
    ? buildAbsoluteUrl(host, "/manage-booking")
    : null;
  const directionsUrl = host ? buildAbsoluteUrl(host, "/directions") : null;

  const root =
    process.env.NEXT_PUBLIC_ROOT_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://myparkingchannel.app";
  const adminBookingsUrl = `${root.replace(/\/$/, "")}/admin/bookings`;

  const addressLines = formatAddressLines({
    address: profile?.address as never,
    county: profile?.county,
    country: profile?.country,
    branding: branding as never,
  });

  return {
    tenantName,
    tenantSlug: tenant?.slug || null,
    notifyEmails,
    contactEmail,
    contactPhone,
    siteUrl,
    manageBookingUrl,
    directionsUrl,
    adminBookingsUrl,
    addressLine: addressLines.length ? addressLines.join(", ") : null,
  };
}

/**
 * Queue customer confirmation + tenant notification for a booking.
 * Used after paid website checkout, and on demand for manual bookings / resends.
 * Never throws — callers should not fail booking creation on email errors.
 */
export async function queueBookingConfirmationEmails(
  input: QueueBookingEmailsInput
): Promise<{
  customerQueued: boolean;
  tenantQueued: boolean;
  tenantRecipients: string[];
  error?: string;
}> {
  let customerQueued = false;
  let tenantQueued = false;
  let tenantRecipients: string[] = [];

  try {
    if (!isValidEmail(input.customerEmail)) {
      return {
        customerQueued: false,
        tenantQueued: false,
        tenantRecipients: [],
        error: "Customer email is missing or invalid",
      };
    }

    const ctx = await resolveTenantNotifyContext(input.tenantId);
    const currency = input.currency || "GBP";
    const sharedPayload = {
      bookingReference: input.bookingReference,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone || null,
      plate: input.plate,
      flightNumber: input.flightNumber || null,
      startAt: input.startAt,
      endAt: input.endAt,
      amount: input.amount,
      currency,
      tenantName: ctx.tenantName,
      siteUrl: ctx.siteUrl,
      manageBookingUrl: ctx.manageBookingUrl,
      directionsUrl: ctx.directionsUrl,
      contactEmail: ctx.contactEmail,
      contactPhone: ctx.contactPhone,
      addressLine: ctx.addressLine,
      adminBookingsUrl: ctx.adminBookingsUrl,
      source: input.source || "Website",
    };

    const confirmationDedupe = input.forceResend
      ? `booking:${input.bookingId}:confirmation:resend:${Date.now()}`
      : `booking:${input.bookingId}:confirmation:v2`;

    const result = await queueEmail({
      tenantId: input.tenantId,
      to: input.customerEmail.trim(),
      toName: input.customerName,
      subject: `Booking confirmed — ${input.bookingReference} | ${ctx.tenantName}`,
      templateKey: "booking_confirmation",
      payload: sharedPayload,
      dedupeKey: confirmationDedupe,
    });
    customerQueued = result.success;
    if (!result.success) {
      console.error("[BOOKING EMAIL] Customer queue failed:", result.error);
      return {
        customerQueued: false,
        tenantQueued: false,
        tenantRecipients: [],
        error: result.error || "Failed to queue confirmation email",
      };
    }

    if (!input.customerOnly) {
      tenantRecipients = ctx.notifyEmails.filter(
        (email) => email.toLowerCase() !== input.customerEmail.trim().toLowerCase()
      );

      if (tenantRecipients.length === 0) {
        if (ctx.notifyEmails.length === 0) {
          console.warn(
            `[BOOKING EMAIL] No booking_notify_emails configured for tenant ${input.tenantId}; skipping tenant notify`
          );
        }
      } else {
        let anyOk = false;
        for (const to of tenantRecipients) {
          const tenantDedupe = input.forceResend
            ? `booking:${input.bookingId}:tenant-notify:${to}:resend:${Date.now()}`
            : `booking:${input.bookingId}:tenant-notify:${to}:v2`;
          const tenantResult = await queueEmail({
            tenantId: input.tenantId,
            to,
            toName: ctx.tenantName,
            subject: `New booking — ${input.bookingReference} | ${input.customerName}`,
            templateKey: "tenant_booking_notification",
            payload: sharedPayload,
            dedupeKey: tenantDedupe,
          });
          if (tenantResult.success) {
            anyOk = true;
          } else {
            console.error(
              "[BOOKING EMAIL] Tenant queue failed:",
              to,
              tenantResult.error
            );
          }
        }
        tenantQueued = anyOk;
      }
    }
  } catch (err) {
    console.error("[BOOKING EMAIL] queueBookingConfirmationEmails failed:", err);
    return {
      customerQueued: false,
      tenantQueued: false,
      tenantRecipients: [],
      error: err instanceof Error ? err.message : "Failed to queue emails",
    };
  }

  return { customerQueued, tenantQueued, tenantRecipients };
}

/**
 * Queue a sample "New booking" notification to configured recipients (or an override list).
 * Used by Admin → Email & Notifications "Send test email".
 */
export async function queueTenantBookingNotifyTest(opts: {
  tenantId: string;
  recipients?: string[];
}): Promise<{ queued: string[]; skipped: boolean; error?: string }> {
  try {
    const ctx = await resolveTenantNotifyContext(opts.tenantId);
    const recipients =
      opts.recipients && opts.recipients.length > 0
        ? opts.recipients
        : ctx.notifyEmails;

    if (recipients.length === 0) {
      return {
        queued: [],
        skipped: true,
        error:
          "No booking notification emails configured. Add at least one address and save first.",
      };
    }

    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const payload = {
      bookingReference: "TEST-NOTIFY",
      customerName: "Test Customer",
      customerEmail: "customer@example.com",
      customerPhone: null,
      plate: "TEST123",
      flightNumber: null,
      startAt: now.toISOString(),
      endAt: end.toISOString(),
      amount: 0,
      currency: "GBP",
      tenantName: ctx.tenantName,
      siteUrl: ctx.siteUrl,
      manageBookingUrl: ctx.manageBookingUrl,
      directionsUrl: ctx.directionsUrl,
      contactEmail: ctx.contactEmail,
      contactPhone: ctx.contactPhone,
      addressLine: ctx.addressLine,
      adminBookingsUrl: ctx.adminBookingsUrl,
      source: "Test",
    };

    const queued: string[] = [];
    for (const to of recipients) {
      const result = await queueEmail({
        tenantId: opts.tenantId,
        to,
        toName: ctx.tenantName,
        subject: `New booking — TEST-NOTIFY | Test Customer`,
        templateKey: "tenant_booking_notification",
        payload,
        dedupeKey: `booking:test-notify:${opts.tenantId}:${to}:${Date.now()}`,
      });
      if (result.success) {
        queued.push(to);
      } else {
        console.error("[BOOKING EMAIL] Test notify failed:", to, result.error);
      }
    }

    if (queued.length === 0) {
      return {
        queued: [],
        skipped: false,
        error: "Failed to queue test notification",
      };
    }

    return { queued, skipped: false };
  } catch (err) {
    return {
      queued: [],
      skipped: false,
      error: err instanceof Error ? err.message : "Failed to send test email",
    };
  }
}
