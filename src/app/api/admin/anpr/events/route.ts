// GET /api/admin/anpr/events — bounded ANPR event list (no select('*'))

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthorizedAnprAdmin } from '@/lib/anpr/adminAnprAuth';
import {
  enforceAnprPageSize,
  resolveAnprEventTimeBounds,
} from '@/lib/anpr/adminAnprEventsParams';
import {
  ADMIN_ANPR_EVENTS_LIST_SELECT,
  assertAnprListSelectSafe,
} from '@/lib/anpr/adminAnprEventsSelect';
import { withQueryTelemetryContext } from '@/lib/supabase/queryTelemetry';

export async function GET(req: NextRequest) {
  return withQueryTelemetryContext(
    { route: '/api/admin/anpr/events', queryName: 'admin.anpr.events' },
    async () => {
      try {
        const preferred = new URL(req.url).searchParams.get('tenantId');
        const auth = await resolveAuthorizedAnprAdmin(preferred);
        if (!auth.ok) {
          return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const { tenantId, adminClient, role } = auth.ctx;
        if (role !== 'admin' && role !== 'owner') {
          return NextResponse.json(
            { error: 'Access denied. Admin role required.' },
            { status: 403 }
          );
        }

        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status');
        const limit = enforceAnprPageSize(searchParams.get('limit') ?? 50);
        const { fromIso, toIso } = resolveAnprEventTimeBounds({
          from: searchParams.get('from'),
          to: searchParams.get('to'),
        });

        assertAnprListSelectSafe(ADMIN_ANPR_EVENTS_LIST_SELECT);

        let query = adminClient
          .from('anpr_events')
          .select(ADMIN_ANPR_EVENTS_LIST_SELECT)
          .eq('tenant_id', tenantId)
          .gte('event_at', fromIso)
          .order('event_at', { ascending: false })
          .limit(limit);

        if (toIso) query = query.lte('event_at', toIso);
        if (status) query = query.eq('status', status);

        const { data: events, error } = await query;

        if (error) {
          console.error('[ANPR Events] Fetch error:', error);
          return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
        }

        return NextResponse.json({
          events: events || [],
          pageSize: limit,
          from: fromIso,
          to: toIso,
          tenantId,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('[ANPR Events] Error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }
  );
}
