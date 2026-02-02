import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const STALE_HOURS = 6;

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
      .select('status, sent_at, received_at, last_error')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest) {
      return NextResponse.json({
        ok: true,
        status: 'unknown',
        lastSentAt: null,
        lastReceivedAt: null,
        lastError: null,
      });
    }

    const now = Date.now();
    const sixHoursAgo = now - STALE_HOURS * 60 * 60 * 1000;
    const lastReceivedAt = latest.received_at ? new Date(latest.received_at).getTime() : null;
    const receivedWithinSixHours = lastReceivedAt !== null && lastReceivedAt >= sixHoursAgo;
    const sentAtOlderThanSixHours = latest.sent_at ? new Date(latest.sent_at).getTime() < sixHoursAgo : true;

    let status: 'ok' | 'down' | 'unknown' = 'unknown';
    if (latest.status === 'received' && receivedWithinSixHours) {
      status = 'ok';
    } else if (latest.status === 'down' || sentAtOlderThanSixHours) {
      status = 'down';
    } else {
      // status === 'sent' and sent within 6h: not yet received → down (ingest path not confirmed)
      status = 'down';
    }

    return NextResponse.json({
      ok: true,
      status,
      lastSentAt: latest.sent_at,
      lastReceivedAt: latest.received_at,
      lastError: latest.last_error,
    });
  } catch (err: any) {
    console.error('[INGEST CANARY HEALTH] error', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
