import { createAdminClient } from '@/lib/supabase/server-admin';
import { queueEmail } from './emailService';

/**
 * Alert ops about email failures
 */
export async function alertEmailFailures(): Promise<void> {
  const supabase = createAdminClient();
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || 'ops@myparkingchannel.app';

  // Find emails that have been failing for more than 30 minutes
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  
  const { data: failedEmails } = await supabase
    .from('email_outbox')
    .select('id, tenant_id, to_email, subject, attempts, last_error, created_at')
    .eq('status', 'failed')
    .lt('next_attempt_at', thirtyMinutesAgo)
    .gte('attempts', 3) // At least 3 failed attempts
    .order('created_at', { ascending: false })
    .limit(50);

  if (!failedEmails || failedEmails.length === 0) {
    return;
  }

  // Get tenant names
  const tenantIds = [...new Set(failedEmails.map(e => e.tenant_id).filter(Boolean))];
  const tenantMap = new Map<string, string>();
  
  if (tenantIds.length > 0) {
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name')
      .in('id', tenantIds);
    
    tenants?.forEach(t => tenantMap.set(t.id, t.name));
  }

  // Group by tenant
  const byTenant = new Map<string, typeof failedEmails>();
  failedEmails.forEach(email => {
    const tenantId = email.tenant_id || 'platform';
    if (!byTenant.has(tenantId)) {
      byTenant.set(tenantId, []);
    }
    byTenant.get(tenantId)!.push(email);
  });

  // Send alert for each tenant with failures
  for (const [tenantId, emails] of byTenant.entries()) {
    const tenantName = tenantMap.get(tenantId) || 'Platform';
    
    await queueEmail({
      tenantId: tenantId !== 'platform' ? tenantId : null,
      to: adminEmail,
      subject: `Email Delivery Failures Alert - ${tenantName}`,
      templateKey: 'ops_alert',
      payload: {
        alertTitle: 'Email Delivery Failures',
        alertType: 'error',
        message: `${emails.length} email(s) have been failing for more than 30 minutes`,
        details: {
          tenant_id: tenantId,
          tenant_name: tenantName,
          failure_count: emails.length,
          failures: emails.map(e => ({
            id: e.id,
            to: e.to_email,
            subject: e.subject,
            attempts: e.attempts,
            last_error: e.last_error,
            created_at: e.created_at,
          })),
        },
        timestamp: new Date().toISOString(),
      },
      dedupeKey: `ops:email_failures:${tenantId}:${new Date().toISOString().split('T')[0]}`,
    });
  }
}

/**
 * Check for bounce rate spikes
 */
export async function checkBounceRate(): Promise<void> {
  const supabase = createAdminClient();
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || 'ops@myparkingchannel.app';

  // Check bounces in last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { data: recentBounces } = await supabase
    .from('email_outbox')
    .select('tenant_id')
    .eq('status', 'bounced')
    .gte('updated_at', oneHourAgo);

  if (!recentBounces || recentBounces.length < 5) {
    return; // Not enough bounces to alert
  }

  // Group by tenant
  const bounceCounts = new Map<string, number>();
  recentBounces.forEach(bounce => {
    const tenantId = bounce.tenant_id || 'platform';
    bounceCounts.set(tenantId, (bounceCounts.get(tenantId) || 0) + 1);
  });

  // Alert if any tenant has 5+ bounces in the last hour
  for (const [tenantId, count] of bounceCounts.entries()) {
    if (count >= 5) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .maybeSingle();
      
      const tenantName = tenant?.name || 'Platform';

      await queueEmail({
        tenantId: tenantId !== 'platform' ? tenantId : null,
        to: adminEmail,
        subject: `High Bounce Rate Alert - ${tenantName}`,
        templateKey: 'ops_alert',
        payload: {
          alertTitle: 'High Email Bounce Rate',
          alertType: 'warning',
          message: `${count} emails bounced in the last hour for ${tenantName}`,
          details: {
            tenant_id: tenantId,
            tenant_name: tenantName,
            bounce_count: count,
            time_window: '1 hour',
          },
          timestamp: new Date().toISOString(),
        },
        dedupeKey: `ops:bounce_rate:${tenantId}:${new Date().toISOString().split(':')[0]}`,
      });
    }
  }
}
