import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Health for ingest canary (Cloudflare Email Routing + Worker + /api/ingest/email).
 * Reads from view ingest_canary_health (thresholds defined in DB view only).
 * Auth: same as other admin health (tenant admin/owner session).
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin
      .from('ingest_canary_health')
      .select('*')
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({
        status: 'unknown',
        lastOk: null,
        ingestDown: true,
        lastError: null,
        token: null,
        processingDown: true,
        lastProcessedOk: null,
      });
    }

    const ingestDown = data.ingest_down;
    const lastOk = data.last_received_at;

    const processingDown = data.processing_down;
    const lastProcessedOk = data.last_processed_at;

    const hasAnyRun = data.has_any_run === true;
    const status: 'ok' | 'down' | 'unknown' = !hasAnyRun ? 'unknown' : ingestDown ? 'down' : 'ok';

    return NextResponse.json({
      status,
      lastOk: lastOk ?? null,
      ingestDown: ingestDown === true,
      lastError: data.last_error ?? null,
      token: data.token ?? null,
      processingDown: processingDown === true,
      lastProcessedOk: lastProcessedOk ?? null,
    });
  } catch (err: any) {
    console.error('[INGEST CANARY HEALTH] error', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
