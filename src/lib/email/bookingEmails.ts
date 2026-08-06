import { createAdminClient } from "@/lib/supabase/server-admin";
import { queueEmail } from "@/lib/email/emailService";
import { resolvePrimaryCanonicalHost, buildAbsoluteUrl } from "@/lib/seo/canonical";
import type { DomainCandidate } from "@/lib/seo/canonical";
import { formatAddressLines } from "@/lib/seo/public-address";

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
};

function isValidEmail(email: string | null | undefined): email is string {
  if (!email?.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

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
      .select("reply_to, from_name")
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

  const tenantName =
    profile?.business_name?.trim() ||
    branding?.app_name?.trim() ||
    tenant?.name?.trim() ||
    "Airport Parking";

  const notifyEmailCandidates = [
    emailSettings?.reply_to,
    profile?.email,
    branding?.contact_email,
  ];
  const notifyEmail =
    notifyEmailCandidates.map((e) => e?.trim()).find((e) => isValidEmail(e)) ||
    null;

  const contactEmail =
    [profile?.email, branding?.contact_email, emailSettings?.reply_to]
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
    notifyEmail,
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
 * Queue customer confirmation + tenant notification for a new paid booking.
 * Never throws — callers should not fail booking creation on email errors.
 */
export async function queueBookingConfirmationEmails(
  input: QueueBookingEmailsInput
): Promise<{ customerQueued: boolean; tenantQueued: boolean }> {
  let customerQueued = false;
  let tenantQueued = false;

  try {
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

    if (isValidEmail(input.customerEmail)) {
      const result = await queueEmail({
        tenantId: input.tenantId,
        to: input.customerEmail.trim(),
        toName: input.customerName,
        subject: `Booking confirmed — ${input.bookingReference} | ${ctx.tenantName}`,
        templateKey: "booking_confirmation",
        payload: sharedPayload,
        dedupeKey: `booking:${input.bookingId}:confirmation:v2`,
      });
      customerQueued = result.success;
      if (!result.success) {
        console.error("[BOOKING EMAIL] Customer queue failed:", result.error);
      }
    }

    if (ctx.notifyEmail) {
      // Avoid double-sending if tenant email equals customer email
      const sameAsCustomer =
        ctx.notifyEmail.toLowerCase() === input.customerEmail.trim().toLowerCase();
      if (!sameAsCustomer) {
        const result = await queueEmail({
          tenantId: input.tenantId,
          to: ctx.notifyEmail,
          toName: ctx.tenantName,
          subject: `New booking — ${input.bookingReference} | ${input.customerName}`,
          templateKey: "tenant_booking_notification",
          payload: sharedPayload,
          dedupeKey: `booking:${input.bookingId}:tenant-notify:v1`,
        });
        tenantQueued = result.success;
        if (!result.success) {
          console.error("[BOOKING EMAIL] Tenant queue failed:", result.error);
        }
      }
    } else {
      console.warn(
        `[BOOKING EMAIL] No tenant notify email configured for tenant ${input.tenantId}`
      );
    }
  } catch (err) {
    console.error("[BOOKING EMAIL] queueBookingConfirmationEmails failed:", err);
  }

  return { customerQueued, tenantQueued };
}
