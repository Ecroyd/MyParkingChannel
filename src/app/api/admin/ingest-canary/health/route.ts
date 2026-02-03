import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Health for ingest canary (Cloudflare Email Routing + Worker + /api/ingest/email).
 * Reads from view ingest_canary_health: DOWN when received_at missing or > 20 min; Last OK = last_received_at.
 * Auth: same as other admin health (tenant admin/owner session).
 */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('ingest_canary_health')
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({
        status: 'unknown',
        lastSentAt: null,
        lastReceivedAt: null,
        lastError: null,
        token: null,
      });
    }

    const ingestDown = data.ingest_down === true;
    const processingDown = (data as { processing_down?: boolean }).processing_down === true;
    const hasAnyRun = data.has_any_run === true;
    const status: 'ok' | 'down' | 'unknown' = !hasAnyRun ? 'unknown' : ingestDown ? 'down' : 'ok';

    return NextResponse.json({
      status,
      lastSentAt: null,
      lastReceivedAt: data.last_received_at ?? null,
      lastError: data.last_error ?? null,
      token: data.token ?? null,
      processingDown: processingDown ?? false,
      lastProcessedAt: (data as { last_processed_at?: string | null }).last_processed_at ?? null,
    });
  } catch (err: any) {
    console.error('[INGEST CANARY HEALTH] error', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
