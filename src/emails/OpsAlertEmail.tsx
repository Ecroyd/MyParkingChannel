interface OpsAlertEmailProps {
  alertTitle: string;
  alertType: 'error' | 'warning' | 'info';
  message: string;
  details?: Record<string, unknown>;
  tenantName?: string;
  timestamp: string;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderOpsAlertEmail(props: OpsAlertEmailProps): string {
  const { alertTitle, alertType, message, details, tenantName, timestamp } = props;

  const alertColors = {
    error: { bg: '#fee', border: '#fcc', text: '#c33' },
    warning: { bg: '#ffd', border: '#fc9', text: '#963' },
    info: { bg: '#eef', border: '#ccf', text: '#339' },
  };
  const colors = alertColors[alertType] || alertColors.info;

  const tenantSection = tenantName
    ? `
    <div style="padding: 16px 0; border-bottom: 1px solid #e6ebf1;">
      <p style="color: #666; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;">Tenant</p>
      <p style="color: #333; font-size: 16px; font-weight: 500; margin: 0;">${escapeHtml(tenantName)}</p>
    </div>`
    : '';

  const detailsSection =
    details && Object.keys(details).length > 0
      ? `
    <div style="padding: 16px 0; border-bottom: 1px solid #e6ebf1;">
      <p style="color: #666; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;">Details</p>
      <pre style="background-color: #f5f5f5; padding: 12px; border-radius: 4px; font-size: 12px; line-height: 18px; overflow: auto; color: #333; margin: 8px 0 0;">${escapeHtml(JSON.stringify(details, null, 2))}</pre>
    </div>`
      : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="background-color: #f6f9fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; margin: 0; padding: 0;">
  <div style="background-color: #ffffff; margin: 0 auto; padding: 20px 0 48px; max-width: 600px;">
    <h1 style="color: #333; font-size: 24px; font-weight: bold; margin: 40px 0 0; padding: 0;">${escapeHtml(alertTitle)}</h1>

    <div style="padding: 16px; border-radius: 5px; border: 2px solid ${colors.border}; margin: 20px 0; background-color: ${colors.bg};">
      <p style="color: ${colors.text}; font-size: 16px; line-height: 26px; margin: 0;">${escapeHtml(message)}</p>
    </div>
    ${tenantSection}
    <div style="padding: 16px 0; border-bottom: 1px solid #e6ebf1;">
      <p style="color: #666; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;">Time</p>
      <p style="color: #333; font-size: 16px; font-weight: 500; margin: 0;">${formatDate(timestamp)}</p>
    </div>
    ${detailsSection}
    <p style="color: #666; font-size: 14px; line-height: 24px; margin-top: 40px;">This is an automated alert from My Parking Channel.</p>
  </div>
</body>
</html>`;
}

export default { renderOpsAlertEmail };
