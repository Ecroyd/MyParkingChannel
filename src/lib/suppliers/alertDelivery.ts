// src/lib/suppliers/alertDelivery.ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { Resend } from 'resend';
import { markAlertSent } from './alerting';

type AlertRoute = {
  id: string;
  kind: 'email' | 'webhook';
  destination: string;
  config: any;
};

/**
 * Get email provider config from tenant_secrets
 */
async function getEmailProviderConfig(tenantId: string, provider: string) {
  const supabase = createAdminClient();
  
  // Try to get from tenant_secrets with scope 'alerting' or 'email'
  const { data: secrets } = await supabase
    .from('tenant_secrets')
    .select('key, value, value_ciphertext, scope')
    .eq('tenant_id', tenantId)
    .in('scope', ['alerting', 'email', 'notifications'])
    .or(`key.eq.${provider}_api_key,key.eq.email_api_key,key.eq.${provider}_from_email,key.eq.email_from_email`);

  if (!secrets || secrets.length === 0) {
    // Fallback to platform secrets
    const { data: platformSecret } = await supabase
      .from('platform_secrets')
      .select('value')
      .eq('key', 'RESEND_API_KEY')
      .maybeSingle();
    
    if (platformSecret?.value) {
      return {
        apiKey: platformSecret.value,
        fromEmail: 'MyParkingChannel <no-reply@myparkingchannel.app>',
      };
    }
    
    return null;
  }

  // Decrypt helper
  const decryptSecret = (encryptedValue: string): string => {
    try {
      return Buffer.from(encryptedValue, 'base64').toString();
    } catch {
      return encryptedValue; // Assume already decrypted
    }
  };

  const getSecret = (key: string): string | null => {
    const secret = secrets.find((s) => s.key === key);
    if (!secret) return null;
    if (secret.value_ciphertext) {
      return decryptSecret(secret.value_ciphertext);
    }
    return secret.value;
  };

  const apiKey = getSecret(`${provider}_api_key`) || getSecret('email_api_key');
  const fromEmail = getSecret(`${provider}_from_email`) || getSecret('email_from_email') || 'MyParkingChannel <no-reply@myparkingchannel.app>';

  if (!apiKey) {
    return null;
  }

  return { apiKey, fromEmail };
}

/**
 * Send email alert
 */
async function sendEmailAlert(
  route: AlertRoute,
  params: {
    tenantId: string;
    supplierCode: string;
    startedAt: string;
    errors: string[];
    runId: string | null;
  }
) {
  const { destination, config } = route;
  const { tenantId, supplierCode, startedAt, errors, runId } = params;

  // Determine provider from config or default to resend
  const provider = config?.provider || 'resend';
  
  const providerConfig = await getEmailProviderConfig(tenantId, provider);
  if (!providerConfig) {
    console.warn(`[ALERT DELIVERY] No email provider config for tenant ${tenantId}, provider ${provider}`);
    return { success: false, error: 'No email provider configured' };
  }

  try {
    if (provider === 'resend') {
      const resend = new Resend(providerConfig.apiKey);
      
      const subject = `[${supplierCode.toUpperCase()}] Sync Failure Alert`;
      const html = `
        <h2>Supplier Sync Failure</h2>
        <p><strong>Tenant:</strong> ${tenantId}</p>
        <p><strong>Supplier:</strong> ${supplierCode}</p>
        <p><strong>Started At:</strong> ${new Date(startedAt).toLocaleString()}</p>
        <p><strong>Run ID:</strong> ${runId || 'N/A'}</p>
        <h3>Errors (${errors.length}):</h3>
        <ul>
          ${errors.map(err => `<li>${err}</li>`).join('')}
        </ul>
      `;

      const result = await resend.emails.send({
        from: providerConfig.fromEmail,
        to: destination,
        subject,
        html,
      });

      return { success: true, result };
    } else {
      // Add support for other providers (sendgrid, postmark, smtp) as needed
      return { success: false, error: `Provider ${provider} not yet implemented` };
    }
  } catch (error: any) {
    console.error('[ALERT DELIVERY] Email send failed', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send webhook alert
 */
async function sendWebhookAlert(
  route: AlertRoute,
  params: {
    tenantId: string;
    supplierCode: string;
    startedAt: string;
    errors: string[];
    runId: string | null;
  }
) {
  const { destination, config } = route;
  const { tenantId, supplierCode, startedAt, errors, runId } = params;

  const payload = {
    tenant_id: tenantId,
    supplier_code: supplierCode,
    started_at: startedAt,
    errors,
    run_id: runId,
  };

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config?.headers || {}),
    };

    // Add auth header if configured
    if (config?.auth_header) {
      headers['Authorization'] = config.auth_header;
    }

    const response = await fetch(destination, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Webhook returned ${response.status}: ${text}`);
    }

    return { success: true };
  } catch (error: any) {
    console.error('[ALERT DELIVERY] Webhook send failed', error);
    return { success: false, error: error.message };
  }
}

/**
 * Deliver alert to all enabled routes for a tenant
 */
export async function deliverAlert(
  alertId: string,
  routes: AlertRoute[],
  params: {
    tenantId: string;
    supplierCode: string;
    startedAt: string;
    errors: string[];
    runId: string | null;
  }
) {
  let allSucceeded = true;

  for (const route of routes) {
    let result;
    
    if (route.kind === 'email') {
      result = await sendEmailAlert(route, params);
    } else if (route.kind === 'webhook') {
      result = await sendWebhookAlert(route, params);
    } else {
      console.warn(`[ALERT DELIVERY] Unknown route kind: ${route.kind}`);
      continue;
    }

    if (!result.success) {
      allSucceeded = false;
      console.error(`[ALERT DELIVERY] Failed to send to ${route.kind} ${route.destination}:`, result.error);
    }
  }

  // Only mark as sent if at least one delivery succeeded
  if (allSucceeded && routes.length > 0) {
    await markAlertSent(alertId);
  }

  return allSucceeded;
}
