import {
  detailRow,
  emailShell,
  escapeHtml,
  formatEmailCurrency,
  formatEmailDate,
  parkingDurationLabel,
} from "./_shared";

export interface TenantBookingNotificationEmailProps {
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
  tenantName?: string;
  adminBookingsUrl?: string | null;
  source?: string | null;
}

export function renderTenantBookingNotificationEmail(
  props: TenantBookingNotificationEmailProps
): string {
  const {
    bookingReference,
    customerName,
    customerEmail,
    customerPhone,
    plate,
    flightNumber,
    startAt,
    endAt,
    amount,
    currency = "GBP",
    tenantName = "Your parking site",
    adminBookingsUrl,
    source,
  } = props;

  const duration = parkingDurationLabel(startAt, endAt);

  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0f172a;">New booking received</h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#334155;">
      A customer has completed a booking on <strong>${escapeHtml(tenantName)}</strong>.
    </p>

    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px 16px;margin:0 0 20px;">
      <p style="margin:0 0 4px;color:#047857;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Reference</p>
      <p style="margin:0;color:#065f46;font-size:20px;font-weight:700;">${escapeHtml(bookingReference)}</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      ${detailRow("Customer", customerName)}
      ${detailRow("Email", customerEmail)}
      ${detailRow("Phone", customerPhone || undefined)}
      ${detailRow("Vehicle registration", plate)}
      ${detailRow("Flight number", flightNumber || undefined)}
      ${detailRow("Arrival", formatEmailDate(startAt))}
      ${detailRow("Departure", formatEmailDate(endAt))}
      ${detailRow("Duration", duration || undefined)}
      ${detailRow("Amount paid", formatEmailCurrency(amount, currency))}
      ${detailRow("Source", source || "Website")}
    </table>

    ${
      adminBookingsUrl
        ? `<p style="margin:0 0 12px;"><a href="${escapeHtml(adminBookingsUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 18px;border-radius:8px;">Open bookings</a></p>`
        : ""
    }

    <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;">
      This notification was sent because a paid booking was created on your site. The customer has also been sent a confirmation email.
    </p>
  `;

  return emailShell({
    preheader: `New booking ${bookingReference} — ${customerName}`,
    brandName: tenantName,
    title: `New booking — ${bookingReference}`,
    bodyHtml,
    footerHtml: `Operational notification for ${escapeHtml(tenantName)}.`,
  });
}

export default { renderTenantBookingNotificationEmail };
