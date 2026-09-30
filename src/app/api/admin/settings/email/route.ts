import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { canManageSettings } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { partitionBookingNotifyEmails } from '@/lib/email/tenantNotifyEmail';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();

    if (!ctx) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    if (!canManageSettings(ctx.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      tenantId,
      from_name,
      reply_to,
      booking_notify_emails,
      booking_notify_email,
      sender_domain_mode,
      tenant_from_email,
    } = body;

    if (tenantId !== ctx.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant ID mismatch' },
        { status: 403 }
      );
    }

    if (sender_domain_mode === 'tenant_domain' && !tenant_from_email) {
      return NextResponse.json(
        { success: false, error: 'Tenant from email required for tenant_domain mode' },
        { status: 400 }
      );
    }

    const { allowed: notifyList, blocked } = partitionBookingNotifyEmails(
      booking_notify_emails ?? booking_notify_email ?? []
    );

    if (blocked.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Do not use platform ingest addresses as notification recipients: ${blocked.join(', ')}. Use a real staff inbox (e.g. info@yourparking.com). bookings@myparkingchannel.app is for Cloudflare inbound booking email only.`,
          blocked,
        },
        { status: 400 }
      );
    }

    const adminClient = await createAdminClient();

    const baseRow = {
      tenant_id: tenantId,
      from_name: from_name || null,
      reply_to: reply_to || null,
      sender_domain_mode: sender_domain_mode || 'platform',
      tenant_from_email:
        sender_domain_mode === 'tenant_domain' ? tenant_from_email || null : null,
      updated_at: new Date().toISOString(),
    };

    let { error } = await adminClient.from('tenant_email_settings').upsert(
      {
        ...baseRow,
        booking_notify_emails: notifyList,
      },
      { onConflict: 'tenant_id' }
    );

    // Older DBs may only have the singular column from a previous migration.
    if (error && /booking_notify_emails/i.test(error.message || '')) {
      ({ error } = await adminClient.from('tenant_email_settings').upsert(
        {
          ...baseRow,
          booking_notify_email: notifyList[0] ?? null,
        },
        { onConflict: 'tenant_id' }
      ));
    }

    if (error) {
      console.error('[TENANT EMAIL SETTINGS] Error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, booking_notify_emails: notifyList });
  } catch (error: any) {
    console.error('[TENANT EMAIL SETTINGS] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
