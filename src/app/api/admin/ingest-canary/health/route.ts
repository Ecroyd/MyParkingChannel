import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const OK_RECEIVED_WITHIN_HOURS = 2;
const SENT_DOWN_AFTER_MINUTES = 15;

/**
 * Health for ingest canary (Cloudflare Email Routing + Worker + /api/ingest/email).
 * Auth: same as other admin health (tenant admin/owner session).
 * Uses service role to read ingest_canary_runs (no RLS policy for tenant admins).
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data: latest } = await supabase
      .from('ingest_canary_runs')
      .select('token, status, sent_at, received_at, last_error')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest) {
      return NextResponse.json({
        status: 'unknown',
        lastSentAt: null,
        lastReceivedAt: null,
        lastError: null,
        token: null,
      });
    }

    const now = Date.now();
    const twoHoursAgo = now - OK_RECEIVED_WITHIN_HOURS * 60 * 60 * 1000;
    const fifteenMinutesAgo = now - SENT_DOWN_AFTER_MINUTES * 60 * 1000;
    const lastReceivedAt = latest.received_at ? new Date(latest.received_at).getTime() : null;
    const receivedWithinTwoHours = lastReceivedAt !== null && lastReceivedAt >= twoHoursAgo;
    const sentAt = latest.sent_at ? new Date(latest.sent_at).getTime() : 0;
    const sentOlderThan15Min = sentAt < fifteenMinutesAgo;

    let status: 'ok' | 'down' | 'unknown' = 'unknown';
    if (latest.status === 'received' && receivedWithinTwoHours) {
      status = 'ok';
    } else if (latest.status === 'down' || (latest.status === 'sent' && sentOlderThan15Min)) {
      status = 'down';
    } else {
      // status === 'sent' and sent within 15 min: still waiting → down (not yet confirmed)
      status = 'down';
    }

    return NextResponse.json({
      status,
      lastSentAt: latest.sent_at,
      lastReceivedAt: latest.received_at,
      lastError: latest.last_error,
      token: latest.token,
    });
  } catch (err: any) {
    console.error('[INGEST CANARY HEALTH] error', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
