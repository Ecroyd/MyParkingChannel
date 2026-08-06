/**
 * Shared HTML helpers for transactional booking emails.
 */

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatEmailDate(dateString: string): string {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return dateString;
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatEmailCurrency(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "GBP",
  }).format(Number(amount) || 0);
}

export function parkingDurationLabel(startAt: string, endAt: string): string | null {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const hours = (end - start) / (1000 * 60 * 60);
  const days = Math.max(1, Math.ceil(hours / 24));
  return days === 1 ? "1 day" : `${days} days`;
}

export function detailRow(label: string, value: string | null | undefined): string {
  if (!value?.trim()) return "";
  return `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #e8eef4; width: 38%; vertical-align: top;">
        <p style="margin: 0; color: #64748b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;">${escapeHtml(label)}</p>
      </td>
      <td style="padding: 12px 0; border-bottom: 1px solid #e8eef4; vertical-align: top;">
        <p style="margin: 0; color: #0f172a; font-size: 15px; font-weight: 600; line-height: 1.4;">${escapeHtml(value)}</p>
      </td>
    </tr>`;
}

export function emailShell(args: {
  preheader: string;
  brandName: string;
  title: string;
  bodyHtml: string;
  footerHtml?: string;
}): string {
  const brand = escapeHtml(args.brandName);
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(args.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(args.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:#0f172a;padding:20px 28px;">
              <p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em;">${brand}</p>
              <p style="margin:6px 0 0;color:#94a3b8;font-size:13px;">Airport parking booking</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              ${args.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                ${args.footerHtml || `This email was sent by ${brand}. Please keep your booking reference for arrival.`}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
