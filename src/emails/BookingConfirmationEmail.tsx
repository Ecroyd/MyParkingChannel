import {
  detailRow,
  emailShell,
  escapeHtml,
  formatEmailCurrency,
  formatEmailDate,
  parkingDurationLabel,
} from "./_shared";

export interface BookingConfirmationEmailProps {
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
  siteUrl?: string | null;
  manageBookingUrl?: string | null;
  directionsUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  addressLine?: string | null;
}

export function renderBookingConfirmationEmail(
  props: BookingConfirmationEmailProps
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
    tenantName = "Airport Parking",
    siteUrl,
    manageBookingUrl,
    directionsUrl,
    contactEmail,
    contactPhone,
    addressLine,
  } = props;

  const duration = parkingDurationLabel(startAt, endAt);
  const firstName = customerName.trim().split(/\s+/)[0] || customerName;

  const ctaButtons = [
    manageBookingUrl
      ? `<a href="${escapeHtml(manageBookingUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 18px;border-radius:8px;margin:0 8px 8px 0;">Manage booking</a>`
      : "",
    directionsUrl
      ? `<a href="${escapeHtml(directionsUrl)}" style="display:inline-block;background:#ffffff;color:#0f172a;text-decoration:none;font-size:14px;font-weight:600;padding:12px 18px;border-radius:8px;border:1px solid #cbd5e1;margin:0 8px 8px 0;">Get directions</a>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const contactBits = [
    contactEmail ? `Email: ${contactEmail}` : null,
    contactPhone ? `Phone: ${contactPhone}` : null,
  ].filter(Boolean);

  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0f172a;">Booking confirmed</h1>
    <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:#334155;">Hi ${escapeHtml(firstName)},</p>
    <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#334155;">
      Your parking with <strong>${escapeHtml(tenantName)}</strong> is confirmed. Please keep this email for your records and quote your booking reference on arrival if asked.
    </p>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 18px;margin:0 0 22px;">
      <p style="margin:0 0 4px;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">Booking reference</p>
      <p style="margin:0;color:#0f172a;font-size:22px;font-weight:700;letter-spacing:0.02em;">${escapeHtml(bookingReference)}</p>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
      ${detailRow("Customer", customerName)}
      ${detailRow("Email", customerEmail)}
      ${detailRow("Phone", customerPhone || undefined)}
      ${detailRow("Vehicle registration", plate)}
      ${detailRow("Flight number", flightNumber || undefined)}
      ${detailRow("Arrival", formatEmailDate(startAt))}
      ${detailRow("Departure", formatEmailDate(endAt))}
      ${detailRow("Duration", duration || undefined)}
      ${detailRow("Amount paid", formatEmailCurrency(amount, currency))}
      ${detailRow("Location", addressLine || undefined)}
    </table>

    ${
      ctaButtons
        ? `<div style="margin:0 0 22px;">${ctaButtons}</div>`
        : ""
    }

    <h2 style="margin:0 0 8px;font-size:16px;color:#0f172a;">What to do next</h2>
    <ol style="margin:0 0 20px;padding-left:20px;color:#334155;font-size:15px;line-height:1.6;">
      <li>Arrive at the car park at your booked arrival time.</li>
      <li>Have your booking reference and vehicle registration ready.</li>
      <li>Use Manage booking if you need to review your reservation details.</li>
    </ol>

    <p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">
      Questions? Contact ${escapeHtml(tenantName)}${
        contactBits.length ? ` — ${escapeHtml(contactBits.join(" · "))}` : ""
      }.
      ${siteUrl ? `<br><a href="${escapeHtml(siteUrl)}" style="color:#0f172a;">${escapeHtml(siteUrl.replace(/^https?:\/\//, ""))}</a>` : ""}
    </p>
  `;

  return emailShell({
    preheader: `Booking ${bookingReference} confirmed with ${tenantName}`,
    brandName: tenantName,
    title: `Booking confirmed — ${bookingReference}`,
    bodyHtml,
  });
}

export default { renderBookingConfirmationEmail };
