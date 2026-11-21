// GET /api/admin/visitors?days=30      → { stats, timezone, days }
// GET /api/admin/visitors?live=1       → { live }
//
// Visitors to the current car park's booking site. Admins and owners only (same as the nav item).

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { roleAtLeast } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { getLiveVisitors, getVisitorStats, isMissingTable } from '@/lib/visitors/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RANGES = new Set([1, 7, 30, 90]);

export async function GET(req: NextRequest) {
  const ctx = await getCurrentTenantContext();
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!roleAtLeast(ctx.role, 'admin')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const url = new URL(req.url);
  try {
    if (url.searchParams.get('live') === '1') {
      return NextResponse.json({ live: await getLiveVisitors(ctx.tenantId) });
    }

    const requested = Number(url.searchParams.get('days'));
    const days = RANGES.has(requested) ? requested : 30;
    const { data: tenant } = await createAdminClient()
      .from('tenants')
      .select('timezone')
      .eq('id', ctx.tenantId)
      .maybeSingle();
    const timezone = (tenant?.timezone as string | null) || 'Europe/London';

    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    const stats = await getVisitorStats(ctx.tenantId, from, to, timezone);
    return NextResponse.json({ stats, timezone, days });
  } catch (err) {
    console.error('[visitors] load failed', err);
    return NextResponse.json(
      {
        error: isMissingTable(err)
          ? 'Visitors is not set up yet (the 20261122_site_visitors database migration has not been run).'
          : 'Could not load visitors',
      },
      { status: 500 }
    );
  }
}
