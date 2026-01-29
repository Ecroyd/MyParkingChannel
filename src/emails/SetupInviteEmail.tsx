interface SetupInviteEmailProps {
  inviteUrl: string;
  tenantName: string;
  inviterName?: string;
  inviterEmail?: string;
  expiresAt?: string;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderSetupInviteEmail(props: SetupInviteEmailProps): string {
  const { inviteUrl, tenantName, inviterName, inviterEmail, expiresAt } = props;

  const inviterText = inviterName && inviterEmail ? `${escapeHtml(inviterName)} (${escapeHtml(inviterEmail)})` : 'Someone';
  const expiresSection = expiresAt
    ? `<p style="color: #666; font-size: 14px; line-height: 20px; margin-top: 16px;">This invitation expires on ${formatDate(expiresAt)}.</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="background-color: #f6f9fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; margin: 0; padding: 0;">
  <div style="background-color: #ffffff; margin: 0 auto; padding: 20px 0 48px; max-width: 600px;">
    <h1 style="color: #333; font-size: 24px; font-weight: bold; margin: 40px 0 0; padding: 0;">You've been invited!</h1>
    <p style="color: #333; font-size: 16px; line-height: 26px;">${inviterText} has invited you to join <strong>${escapeHtml(tenantName)}</strong> on My Parking Channel.</p>

    <div style="padding: 27px 0;">
      <a href="${escapeHtml(inviteUrl)}" style="display: inline-block; background-color: #556cd6; border-radius: 5px; color: #fff; font-size: 16px; font-weight: bold; text-decoration: none; text-align: center; padding: 12px 24px;">Accept Invitation</a>
    </div>

    <p style="color: #666; font-size: 14px; line-height: 20px; margin-top: 16px;">Or copy and paste this URL into your browser:</p>
    <p style="color: #556cd6; text-decoration: underline; word-break: break-all;">${escapeHtml(inviteUrl)}</p>
    ${expiresSection}
    <p style="color: #666; font-size: 14px; line-height: 24px; margin-top: 40px;">If you didn't expect this invitation, you can safely ignore this email.</p>
  </div>
</body>
</html>`;
}

export default { renderSetupInviteEmail };
