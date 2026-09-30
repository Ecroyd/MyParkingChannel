import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { canManageSettings } from '@/lib/auth/permissions';
import { normalizeEmailList } from '@/lib/email/tenantNotifyEmail';
import { queueTenantBookingNotifyTest } from '@/lib/email/bookingEmails';

/**
 * Queue a sample "New booking" notification to the tenant's configured recipients
 * (or an optional override list from the unsaved form).
 */
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

    const body = await req.json().catch(() => ({}));
    const tenantId = body.tenantId || ctx.tenantId;
    if (tenantId !== ctx.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Tenant ID mismatch' },
        { status: 403 }
      );
    }

    const override = normalizeEmailList(body.booking_notify_emails ?? body.recipients ?? []);
    const result = await queueTenantBookingNotifyTest({
      tenantId,
      recipients: override.length > 0 ? override : undefined,
    });

    if (result.error && result.queued.length === 0) {
      return NextResponse.json(
        { success: false, error: result.error, skipped: result.skipped },
        { status: result.skipped ? 400 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      queued: result.queued,
      message: `Test notification queued to ${result.queued.join(', ')}`,
    });
  } catch (error: any) {
    console.error('[BOOKING NOTIFY TEST]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
