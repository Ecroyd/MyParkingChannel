import { NextRequest, NextResponse } from 'next/server';
import { sendDueEmails } from '@/lib/email/emailService';
import { alertEmailFailures, checkBounceRate } from '@/lib/email/alerting';

/**
 * Internal cron job to send queued emails
 * Auth: Requires INTERNAL_CRON_KEY header
 */
export async function POST(req: NextRequest) {
  try {
    // Verify internal auth
    const authHeader = req.headers.get('authorization');
    const cronKey = process.env.INTERNAL_CRON_KEY;
    
    if (!cronKey) {
      console.error('[EMAIL CRON] INTERNAL_CRON_KEY not configured');
      return NextResponse.json(
        { error: 'Cron key not configured' },
        { status: 500 }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${cronKey}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get limit from query or body (default 50)
    const url = new URL(req.url);
    const limitParam = url.searchParams.get('limit');
    const body = await req.json().catch(() => ({}));
    const limit = parseInt(limitParam || body.limit || '50', 10);

    // Send due emails
    const result = await sendDueEmails(limit);

    // Check for alerts (run in background, don't wait)
    Promise.all([
      alertEmailFailures().catch(err => console.error('[EMAIL CRON] Alert check failed:', err)),
      checkBounceRate().catch(err => console.error('[EMAIL CRON] Bounce check failed:', err)),
    ]).catch(() => {}); // Ignore errors in alert checks

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[EMAIL CRON] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Also support GET for easy testing
export async function GET(req: NextRequest) {
  return POST(req);
}
