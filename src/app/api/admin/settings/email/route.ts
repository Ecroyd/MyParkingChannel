import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { canManageSettings } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/server-admin';

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
      booking_notify_email,
      sender_domain_mode,
      tenant_from_email,
    } = body;

    // Validate tenantId matches context
    if (tenantId !== ctx.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant ID mismatch' },
        { status: 403 }
      );
    }

    // Validate sender_domain_mode
    if (sender_domain_mode === 'tenant_domain' && !tenant_from_email) {
      return NextResponse.json(
        { success: false, error: 'Tenant from email required for tenant_domain mode' },
        { status: 400 }
      );
    }

    const adminClient = await createAdminClient();

    const baseRow = {
      tenant_id: tenantId,
      from_name: from_name || null,
      reply_to: reply_to || null,
      sender_domain_mode: sender_domain_mode || 'platform',
      tenant_from_email: sender_domain_mode === 'tenant_domain' ? (tenant_from_email || null) : null,
      updated_at: new Date().toISOString(),
    };

    // Prefer writing booking_notify_email; fall back if migration not applied yet.
    let { error } = await adminClient
      .from('tenant_email_settings')
      .upsert(
        { ...baseRow, booking_notify_email: booking_notify_email || null },
        { onConflict: 'tenant_id' }
      );

    if (error && /booking_notify_email/i.test(error.message || '')) {
      ({ error } = await adminClient
        .from('tenant_email_settings')
        .upsert(baseRow, { onConflict: 'tenant_id' }));
    }

    if (error) {
      console.error('[TENANT EMAIL SETTINGS] Error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[TENANT EMAIL SETTINGS] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
