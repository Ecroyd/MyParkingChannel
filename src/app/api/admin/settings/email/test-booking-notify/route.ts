import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { canManageSettings } from '@/lib/auth/permissions';
import { partitionBookingNotifyEmails } from '@/lib/email/tenantNotifyEmail';
import { queueTenantBookingNotifyTest } from '@/lib/email/bookingEmails';

/**
 * Queue + immediately send a sample "New booking" notification via Resend.
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

    const { allowed: override, blocked } = partitionBookingNotifyEmails(
      body.booking_notify_emails ?? body.recipients ?? []
    );
    if (blocked.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot send to platform ingest address(es): ${blocked.join(', ')}. Use a staff inbox, not bookings@myparkingchannel.app.`,
          blocked,
        },
        { status: 400 }
      );
    }
    const result = await queueTenantBookingNotifyTest({
      tenantId,
      recipients: override.length > 0 ? override : undefined,
    });

    if (result.sent.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Test email was not delivered',
          skipped: result.skipped,
          queued: result.queued,
          failed: result.failed,
        },
        { status: result.skipped ? 400 : 502 }
      );
    }

    const failNote =
      result.failed.length > 0
        ? ` (${result.failed.length} failed: ${result.failed.map((f) => f.to).join(', ')})`
        : '';

    return NextResponse.json({
      success: true,
      sent: result.sent,
      queued: result.queued,
      failed: result.failed,
      message: `Test notification sent to ${result.sent.join(', ')}${failNote}`,
    });
  } catch (error: any) {
    console.error('[BOOKING NOTIFY TEST]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
