import { createAdminClient } from '@/lib/supabase/server-admin';
import { Resend } from 'resend';
import { renderBookingConfirmationEmail } from '@/emails/BookingConfirmationEmail';
import { renderBookingCancelledEmail } from '@/emails/BookingCancelledEmail';
import { renderSetupInviteEmail } from '@/emails/SetupInviteEmail';
import { renderOpsAlertEmail } from '@/emails/OpsAlertEmail';

export interface QueueEmailParams {
  tenantId?: string | null;
  to: string;
  toName?: string | null;
  subject: string;
  templateKey: 'booking_confirmation' | 'booking_cancelled' | 'setup_invite' | 'ops_alert';
  payload: Record<string, any>;
  dedupeKey?: string | null;
}

export interface EmailSettings {
  fromEmail: string;
  fromName: string;
  replyTo?: string | null;
  apiKey: string;
}

/**
 * Get email settings for a tenant (with platform fallback)
 */
async function getEmailSettings(tenantId?: string | null): Promise<EmailSettings | null> {
  const supabase = createAdminClient();

  // Get platform email provider settings
  const { data: providerSettings } = await supabase
    .from('email_provider_settings')
    .select('*')
    .eq('provider', 'resend')
    .eq('is_enabled', true)
    .maybeSingle();

  if (!providerSettings) {
    console.error('[EMAIL SERVICE] No email provider settings found');
    return null;
  }

  // Decrypt API key (simple base64 decode for now - can be enhanced with proper encryption)
  let apiKey: string;
  try {
    apiKey = Buffer.from(providerSettings.resend_api_key_encrypted, 'base64').toString();
  } catch {
    apiKey = providerSettings.resend_api_key_encrypted; // Assume already decrypted
  }

  // Default values from platform
  let fromEmail = providerSettings.default_from_email;
  let fromName = providerSettings.default_from_name;
  let replyTo = providerSettings.default_reply_to;

  // Override with tenant settings if tenantId provided
  if (tenantId) {
    const { data: tenantSettings } = await supabase
      .from('tenant_email_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (tenantSettings) {
      if (tenantSettings.from_name) {
        fromName = tenantSettings.from_name;
      }
      if (tenantSettings.reply_to) {
        replyTo = tenantSettings.reply_to;
      }
      if (tenantSettings.sender_domain_mode === 'tenant_domain' && tenantSettings.tenant_from_email) {
        fromEmail = tenantSettings.tenant_from_email;
      }
    }
  }

  return {
    apiKey,
    fromEmail,
    fromName,
    replyTo,
  };
}

/**
 * Render email template to HTML
 */
function renderTemplate(templateKey: string, payload: Record<string, any>): string {
  switch (templateKey) {
    case 'booking_confirmation':
      return renderBookingConfirmationEmail(payload as Parameters<typeof renderBookingConfirmationEmail>[0]);
    case 'booking_cancelled':
      return renderBookingCancelledEmail(payload as Parameters<typeof renderBookingCancelledEmail>[0]);
    case 'setup_invite':
      return renderSetupInviteEmail(payload as Parameters<typeof renderSetupInviteEmail>[0]);
    case 'ops_alert':
      return renderOpsAlertEmail(payload as Parameters<typeof renderOpsAlertEmail>[0]);
    default:
      throw new Error(`Unknown template key: ${templateKey}`);
  }
}

/**
 * Queue an email for sending
 */
export async function queueEmail(params: QueueEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createAdminClient();

  try {
    // Get email settings
    const settings = await getEmailSettings(params.tenantId);
    if (!settings) {
      return { success: false, error: 'Email service not configured' };
    }

    // Prepare email outbox row
    const outboxRow: any = {
      tenant_id: params.tenantId || null,
      to_email: params.to,
      to_name: params.toName || null,
      from_email: settings.fromEmail,
      from_name: settings.fromName,
      reply_to: settings.replyTo || null,
      subject: params.subject,
      template_key: params.templateKey,
      template_version: 1,
      payload: params.payload,
      status: 'queued',
      provider: 'resend',
      dedupe_key: params.dedupeKey || null,
      next_attempt_at: new Date().toISOString(),
    };

    // Insert into outbox (handle dedupe_key conflicts gracefully)
    const { data, error } = await supabase
      .from('email_outbox')
      .insert(outboxRow)
      .select('id')
      .single();

    if (error) {
      // Check if it's a duplicate key error
      if (error.code === '23505' || error.message?.includes('duplicate key')) {
        console.log(`[EMAIL SERVICE] Duplicate email skipped (dedupe_key: ${params.dedupeKey})`);
        return { success: true }; // Not an error, just skipped
      }
      console.error('[EMAIL SERVICE] Failed to queue email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (error: any) {
    console.error('[EMAIL SERVICE] Error queueing email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send due emails from the queue
 */
export async function sendDueEmails(limit: number = 20): Promise<{ sent: number; failed: number; errors: string[] }> {
  const supabase = createAdminClient();
  const errors: string[] = [];
  let sent = 0;
  let failed = 0;

  try {
    // Select emails that are due for sending
    const { data: dueEmails, error: fetchError } = await supabase
      .from('email_outbox')
      .select('*')
      .in('status', ['queued', 'failed'])
      .lte('next_attempt_at', new Date().toISOString())
      .lt('attempts', 10) // Max 10 attempts
      .order('created_at', { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error('[EMAIL SERVICE] Failed to fetch due emails:', fetchError);
      return { sent: 0, failed: 0, errors: [fetchError.message] };
    }

    if (!dueEmails || dueEmails.length === 0) {
      return { sent: 0, failed: 0, errors: [] };
    }

    // Mark as sending (atomic update)
    const emailIds = dueEmails.map(e => e.id);
    const { error: updateError } = await supabase
      .from('email_outbox')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .in('id', emailIds)
      .in('status', ['queued', 'failed']); // Only update if still queued/failed

    if (updateError) {
      console.error('[EMAIL SERVICE] Failed to mark emails as sending:', updateError);
      return { sent: 0, failed: 0, errors: [updateError.message] };
    }

    // Process each email
    for (const email of dueEmails) {
      try {
        // Get settings (may have changed since queued)
        const settings = await getEmailSettings(email.tenant_id);
        if (!settings) {
          throw new Error('Email service not configured');
        }

        // Render template
        const html = renderTemplate(email.template_key, email.payload);

        // Send via Resend
        const resend = new Resend(settings.apiKey);
        const result = await resend.emails.send({
          from: `${email.from_name} <${email.from_email}>`,
          to: email.to_email,
          subject: email.subject,
          html,
          replyTo: email.reply_to || undefined,
        });

        if (result.error) {
          throw new Error(result.error.message || 'Resend API error');
        }

        // Update as sent
        await supabase
          .from('email_outbox')
          .update({
            status: 'sent',
            provider_message_id: result.data?.id || null,
            attempts: email.attempts + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.id);

        sent++;
      } catch (error: any) {
        console.error(`[EMAIL SERVICE] Failed to send email ${email.id}:`, error);

        // Calculate exponential backoff: 2^attempts minutes (max 24 hours)
        const backoffMinutes = Math.min(Math.pow(2, email.attempts), 24 * 60);
        const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

        // Update as failed
        await supabase
          .from('email_outbox')
          .update({
            status: 'failed',
            attempts: email.attempts + 1,
            next_attempt_at: nextAttemptAt.toISOString(),
            last_error: error.message || 'Unknown error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', email.id);

        failed++;
        errors.push(`Email ${email.id}: ${error.message}`);
      }
    }

    return { sent, failed, errors };
  } catch (error: any) {
    console.error('[EMAIL SERVICE] Error in sendDueEmails:', error);
    return { sent, failed, errors: [...errors, error.message] };
  }
}
