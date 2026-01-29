interface BookingCancelledEmailProps {
  bookingReference: string;
  customerName: string;
  plate: string;
  startAt: string;
  endAt: string;
  refundAmount?: number;
  currency?: string;
  tenantName?: string;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderBookingCancelledEmail(props: BookingCancelledEmailProps): string {
  const {
    bookingReference,
    customerName,
    plate,
    startAt,
    endAt,
    refundAmount,
    currency = 'GBP',
    tenantName = 'My Parking Channel',
  } = props;

  const refundSection =
    refundAmount !== undefined && refundAmount > 0
      ? `
    <div style="padding: 16px 0; border-bottom: 1px solid #e6ebf1;">
      <p style="color: #666; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;">Refund Amount</p>
      <p style="color: #333; font-size: 16px; font-weight: 500; margin: 0;">${formatCurrency(refundAmount, currency)}</p>
      <p style="color: #666; font-size: 14px; line-height: 20px; margin-top: 8px;">Your refund will be processed within 5-10 business days.</p>
    </div>`
      : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="background-color: #f6f9fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; margin: 0; padding: 0;">
  <div style="background-color: #ffffff; margin: 0 auto; padding: 20px 0 48px; max-width: 600px;">
    <h1 style="color: #333; font-size: 24px; font-weight: bold; margin: 40px 0 0; padding: 0;">Booking Cancelled</h1>
    <p style="color: #333; font-size: 16px; line-height: 26px;">Hi ${escapeHtml(customerName)},</p>
    <p style="color: #333; font-size: 16px; line-height: 26px;">Your parking booking has been cancelled. Here are the details:</p>

    <div style="padding: 16px 0; border-bottom: 1px solid #e6ebf1;">
      <p style="color: #666; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;">Booking Reference</p>
      <p style="color: #333; font-size: 16px; font-weight: 500; margin: 0;">${escapeHtml(bookingReference)}</p>
    </div>
    <div style="padding: 16px 0; border-bottom: 1px solid #e6ebf1;">
      <p style="color: #666; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;">Vehicle Registration</p>
      <p style="color: #333; font-size: 16px; font-weight: 500; margin: 0;">${escapeHtml(plate)}</p>
    </div>
    <div style="padding: 16px 0; border-bottom: 1px solid #e6ebf1;">
      <p style="color: #666; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;">Original Arrival</p>
      <p style="color: #333; font-size: 16px; font-weight: 500; margin: 0;">${formatDate(startAt)}</p>
    </div>
    <div style="padding: 16px 0; border-bottom: 1px solid #e6ebf1;">
      <p style="color: #666; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;">Original Departure</p>
      <p style="color: #333; font-size: 16px; font-weight: 500; margin: 0;">${formatDate(endAt)}</p>
    </div>
    ${refundSection}
    <p style="color: #666; font-size: 14px; line-height: 24px; margin-top: 40px;">If you have any questions, please contact ${escapeHtml(tenantName)}.</p>
  </div>
</body>
</html>`;
}

export default { renderBookingCancelledEmail };
