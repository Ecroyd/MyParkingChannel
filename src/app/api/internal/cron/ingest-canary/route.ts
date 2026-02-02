import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { queueEmail, sendDueEmails } from '@/lib/email/emailService';

const CANARY_TO_EMAIL = 'canary-bookings@myparkingchannel.app';
const STALE_MINUTES = 10;
const TOKEN_RANDOM_BYTES = 4; // 6 chars base64url

/**
 * GET: Test run / ping. cron-job.org "test run" may use GET; return 200 so it succeeds.
 */
export async function GET(req: NextRequest) {
  console.log('[INGEST CANARY] GET /api/internal/cron/ingest-canary called');
  return NextResponse.json({
    ok: true,
    note: 'use POST for real runs',
  });
}

/**
 * Internal cron: evaluate previous ingest canary and send next one.
 * Auth: Authorization: Bearer INTERNAL_CRON_KEY
 * External scheduler (e.g. cron-job.org) calls POST /api/internal/cron/ingest-canary with header.
 */
export async function POST(req: NextRequest) {
  console.log('[INGEST CANARY] POST /api/internal/cron/ingest-canary called');
  try {
    const authHeader = req.headers.get('authorization');
    const cronKey = process.env.INTERNAL_CRON_KEY;

    if (!cronKey) {
      console.error('[INGEST CANARY] INTERNAL_CRON_KEY not configured');
      return NextResponse.json({ ok: false, error: 'Cron key not configured' }, { status: 500 });
    }
    if (!authHeader || authHeader !== `Bearer ${cronKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    let previousDown = false;

    // A) Evaluate previous canary: mark as down if not received within 10 minutes
    const staleCutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();
    const { data: latestRun } = await supabase
      .from('ingest_canary_runs')
      .select('id, token, status, sent_at')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestRun && latestRun.status !== 'received' && latestRun.sent_at < staleCutoff) {
      await supabase
        .from('ingest_canary_runs')
        .update({
          status: 'down',
          last_error: 'canary not received within 10 minutes',
        })
        .eq('id', latestRun.id);
      previousDown = true;
    }

    // B) Create new canary run and send email
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const min = String(now.getUTCMinutes()).padStart(2, '0');
    const timePart = `${yyyy}${mm}${dd}-${hh}${min}`;
    const randomPart = crypto.randomBytes(TOKEN_RANDOM_BYTES).toString('base64url').slice(0, 6);
    const token = `ingest-${timePart}-${randomPart}`;

    await supabase.from('ingest_canary_runs').insert({
      token,
      sent_at: now.toISOString(),
      status: 'sent',
    });

    const subject = `[CANARY] cloudflare-ingest token=${token}`;
    const dedupeKey = `ingest-canary-${timePart}`;
    const queueResult = await queueEmail({
      tenantId: null,
      to: CANARY_TO_EMAIL,
      subject,
      templateKey: 'ops_alert',
      payload: {
        alertTitle: 'Ingest canary',
        alertType: 'info',
        message: `CANARY_TOKEN=${token}`,
        details: { token },
        tenantName: null,
        timestamp: now.toISOString(),
      },
      dedupeKey,
    });

    if (!queueResult.success) {
      console.error('[INGEST CANARY] Failed to queue email:', queueResult.error);
      await supabase
        .from('ingest_canary_runs')
        .update({ status: 'down', last_error: queueResult.error || 'queue failed' })
        .eq('token', token);
      return NextResponse.json(
        { ok: false, previousDown, token, error: queueResult.error },
        { status: 500 }
      );
    }

    // Send immediately so canary email goes out in this request
    await sendDueEmails(5);

    return NextResponse.json({ ok: true, token, previousMarkedDown: previousDown });
  } catch (err: any) {
    console.error('[INGEST CANARY] Error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
