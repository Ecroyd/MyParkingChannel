# Email Queue System Implementation

This document describes the comprehensive email queue system using Resend for Parking Channel.

## Overview

The system provides:
- **Queue-based email sending** with retries and exponential backoff
- **Multi-tenant support** with per-tenant email settings
- **React Email templates** for consistent, beautiful emails
- **Webhook integration** for delivery status tracking
- **Admin UI** for platform and tenant email configuration
- **Automatic alerting** for failed emails and bounce spikes

## Database Schema

### Tables Created

1. **email_provider_settings** (platform-level)
   - Stores Resend API key (encrypted)
   - Default from email/name
   - Platform-wide email toggle

2. **tenant_email_settings** (per-tenant)
   - Tenant-specific from name
   - Reply-to address
   - Sender domain mode (platform vs tenant domain)

3. **email_outbox** (queue)
   - Email queue with status tracking
   - Deduplication via `dedupe_key`
   - Retry logic with exponential backoff
   - Provider message ID for webhook tracking

## Setup Instructions

### 1. Run Database Migration

Execute the SQL migration file:
```bash
# Apply migration to Supabase
supabase/migrations/20250128_email_queue_system.sql
```

### 2. Install Dependencies

```bash
npm install @react-email/components @react-email/render
```

### 3. Configure Environment Variables

Add to `.env.local`:
```env
# Internal cron authentication
INTERNAL_CRON_KEY=your-secret-key-here

# Resend webhook secret (optional but recommended)
RESEND_WEBHOOK_SECRET=your-resend-webhook-secret

# Admin notification email for alerts
ADMIN_NOTIFY_EMAIL=ops@yourdomain.com
```

### 4. Set Up Platform Email Settings

1. Navigate to `/admin/platform/email-settings` (platform admin only)
2. Enter your Resend API key
3. Configure default from email/name
4. Enable email sending

### 5. Configure Tenant Email Settings (Optional)

1. Navigate to `/admin/settings/email` (tenant admin)
2. Override from name if desired
3. Set reply-to address
4. Configure sender domain mode (future: tenant domain support)

### 6. Set Up Cron Job

Add to `vercel.json` or your cron scheduler:
```json
{
  "crons": [
    {
      "path": "/api/internal/cron/email-sender",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

Or use Vercel Cron:
- Path: `/api/internal/cron/email-sender`
- Schedule: Every 1 minute
- Headers: `Authorization: Bearer ${INTERNAL_CRON_KEY}`

### 7. Configure Resend Webhook

1. Go to Resend dashboard → Webhooks
2. Add webhook URL: `https://yourdomain.com/api/webhooks/resend`
3. Select events: `email.delivered`, `email.bounced`, `email.complained`
4. Copy webhook secret to `RESEND_WEBHOOK_SECRET`

## Usage

### Queue an Email

```typescript
import { queueEmail } from '@/lib/email/emailService';

await queueEmail({
  tenantId: 'tenant-uuid', // Optional
  to: 'customer@example.com',
  toName: 'John Doe', // Optional
  subject: 'Booking Confirmed',
  templateKey: 'booking_confirmation',
  payload: {
    bookingReference: 'ABC123',
    customerName: 'John Doe',
    // ... template-specific props
  },
  dedupeKey: 'booking:123:confirmation:v1', // Optional, prevents duplicates
});
```

### Available Templates

1. **booking_confirmation** - Booking confirmation email
2. **booking_cancelled** - Booking cancellation email
3. **setup_invite** - Tenant setup/invitation email
4. **ops_alert** - Operations alert email

### Email Service Functions

- `queueEmail(params)` - Queue an email for sending
- `sendDueEmails(limit)` - Process queued emails (called by cron)
- `alertEmailFailures()` - Check for failed emails and alert ops
- `checkBounceRate()` - Monitor bounce rates and alert on spikes

## Integration Points

### Booking Flows

Emails are automatically queued when:
- Booking is created (confirmation email)
- Booking is cancelled (cancellation email)

### Current Integration

- ✅ `/api/bookings/create-from-payment` - Queues confirmation email
- ✅ `/api/stripe/webhook` - Queues confirmation email on payment success
- ✅ `/api/manage-booking/cancel` - Queues cancellation email

## Monitoring

### Email Status

Check email status in `email_outbox` table:
- `queued` - Waiting to be sent
- `sending` - Currently being sent
- `sent` - Successfully sent (awaiting delivery confirmation)
- `delivered` - Confirmed delivered via webhook
- `bounced` - Bounced or complained
- `failed` - Failed after retries

### Alerting

The system automatically alerts ops when:
- Emails fail after 3+ attempts and remain failed for 30+ minutes
- Bounce rate exceeds 5 bounces per hour for any tenant

Alerts are sent via the email queue itself (using `ops_alert` template).

## Security

- API keys stored encrypted (base64, can be enhanced)
- Webhook signature verification
- RLS policies on all tables
- Platform admin required for platform settings
- Tenant admin required for tenant settings

## Future Enhancements

- [ ] Tenant domain verification and sending
- [ ] Email template editor UI
- [ ] Email analytics dashboard
- [ ] A/B testing for templates
- [ ] Enhanced encryption for API keys
- [ ] Support for multiple email providers

## Troubleshooting

### Emails not sending

1. Check `email_provider_settings.is_enabled` is `true`
2. Verify Resend API key is correct
3. Check cron job is running
4. Review `email_outbox` table for errors

### Webhook not receiving events

1. Verify webhook URL is correct in Resend dashboard
2. Check `RESEND_WEBHOOK_SECRET` matches Resend configuration
3. Review webhook logs in Resend dashboard

### High failure rate

1. Check Resend account status
2. Verify sender domain is verified
3. Review bounce reasons in Resend dashboard
4. Check email content for spam triggers
