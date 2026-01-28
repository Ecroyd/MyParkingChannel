import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import crypto from 'crypto';

/**
 * Resend webhook handler
 * Handles email delivery events: delivered, bounced, complained
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('resend-signature');

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('[RESEND WEBHOOK] Invalid signature');
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    }

    const payload = JSON.parse(body);
    const { type, data } = payload;

    if (!type || !data?.email_id) {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Find email in outbox by provider_message_id
    const { data: emailRow, error: findError } = await supabase
      .from('email_outbox')
      .select('id, tenant_id')
      .eq('provider_message_id', data.email_id)
      .maybeSingle();

    if (findError) {
      console.error('[RESEND WEBHOOK] Error finding email:', findError);
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      );
    }

    if (!emailRow) {
      console.warn(`[RESEND WEBHOOK] Email not found in outbox: ${data.email_id}`);
      // Still return 200 to acknowledge webhook
      return NextResponse.json({ received: true, message: 'Email not found in outbox' });
    }

    // Update status based on event type
    let newStatus: string;
    let shouldAlert = false;

    switch (type) {
      case 'email.delivered':
        newStatus = 'delivered';
        break;
      case 'email.bounced':
      case 'email.complained':
        newStatus = 'bounced';
        shouldAlert = true;
        break;
      default:
        // Unknown event type, log but don't update
        console.log(`[RESEND WEBHOOK] Unknown event type: ${type}`);
        return NextResponse.json({ received: true });
    }

    // Update email status
    const { error: updateError } = await supabase
      .from('email_outbox')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', emailRow.id);

    if (updateError) {
      console.error('[RESEND WEBHOOK] Error updating email status:', updateError);
      return NextResponse.json(
        { error: 'Failed to update status' },
        { status: 500 }
      );
    }

    // Alert ops if bounced/complained
    if (shouldAlert) {
      // Queue an ops alert email
      const { queueEmail } = await import('@/lib/email/emailService');
      await queueEmail({
        tenantId: emailRow.tenant_id,
        to: process.env.ADMIN_NOTIFY_EMAIL || 'ops@myparkingchannel.app',
        subject: `Email Bounce Alert: ${data.email_id}`,
        templateKey: 'ops_alert',
        payload: {
          alertTitle: 'Email Delivery Failed',
          alertType: 'error',
          message: `Email ${data.email_id} bounced or was complained about`,
          details: {
            email_id: data.email_id,
            event_type: type,
            recipient: data.to || 'unknown',
            bounce_type: data.bounce_type || null,
          },
          timestamp: new Date().toISOString(),
        },
        dedupeKey: `ops:email_bounce:${data.email_id}`,
      });
    }

    return NextResponse.json({ received: true, status: newStatus });
  } catch (error: any) {
    console.error('[RESEND WEBHOOK] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
