import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { queueEmail, sendDueEmails } from '@/lib/email/emailService';
import { logRequestAttribution } from '@/lib/jobSecret';
import { getCanaryHealth } from '@/lib/health/canary';
import { writeHealthStatus } from '@/lib/health/writeHealthStatus';
import { isCronRequest } from '@/lib/auth/apiGuards';

// Parsing/sync can take a while; allow up to 5 minutes (Vercel Pro).
export const maxDuration = 300;

const CANARY_TO_EMAIL = 'canary-bookings@myparkingchannel.app';
const STALE_MINUTES = 10;
const TOKEN_RANDOM_BYTES = 4; // 6 chars base64url

/**
 * GET: Test run / ping. cron-job.org "test run" may use GET; return 200 so it succeeds.
 */
export async function GET(req: NextRequest) {
  logRequestAttribution(req, '/api/internal/cron/ingest-canary');
  // Vercel Cron calls GET with Authorization: Bearer CRON_SECRET: run the real job.
  if (isCronRequest(req)) return POST(req);
  return new NextResponse('Forbidden', { status: 403 });
}

/**
 * Internal cron: evaluate previous ingest canary and send next one.
 * Auth: x-job-secret (JOB_SECRET) or Authorization: Bearer INTERNAL_CRON_KEY or x-internal-cron-key.
 * External scheduler (e.g. cron-job.org) calls POST with one of these headers.
 */
export async function POST(req: NextRequest) {
  logRequestAttribution(req, '/api/internal/cron/ingest-canary');
  try {
    // Accepts JOB_SECRET, Bearer INTERNAL_CRON_KEY / CRON_SECRET (Vercel Cron), or x-internal-cron-key.
    if (!isCronRequest(req)) {
      return NextResponse.json({ ok: false, reason: 'invalid token' }, { status: 401 });
    }

    console.log('[INGEST CANARY] POST /api/internal/cron/ingest-canary called');
    console.log('[INGEST CANARY] step=auth_ok');

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
    console.log('[INGEST CANARY] step=prev_checked');

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
    console.log('[INGEST CANARY] step=run_inserted token=' + token);

    const subject = `[CANARY] cloudflare-ingest token=${token}`;
    const dedupeKey = `ingest-canary-${timePart}`;
    console.log('[INGEST CANARY] step=send_start');
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
    console.log('[INGEST CANARY] step=send_done');

    // Write canary health to system_health_status so UI can read from Supabase (revalidate: 60)
    try {
      const canaryHealth = await getCanaryHealth();
      await writeHealthStatus(null, 'canary', canaryHealth as unknown as Record<string, unknown>);
    } catch (e) {
      console.warn('[INGEST CANARY] Failed to write health status', e);
    }

    return NextResponse.json({ ok: true, token, previousMarkedDown: previousDown });
  } catch (err: any) {
    console.error('[INGEST CANARY] ERROR', {
      message: err?.message || String(err),
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
