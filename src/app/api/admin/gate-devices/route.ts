import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthorizedAnprAdmin } from '@/lib/anpr/adminAnprAuth';
import { ADMIN_GATE_DEVICES_SELECT } from '@/lib/anpr/adminAnprEventsSelect';
import { withQueryTelemetryContext } from '@/lib/supabase/queryTelemetry';

export async function GET(req: NextRequest) {
  return withQueryTelemetryContext(
    { route: '/api/admin/gate-devices', queryName: 'admin.anpr.devices' },
    async () => {
      try {
        const preferred = new URL(req.url).searchParams.get('tenantId');
        const auth = await resolveAuthorizedAnprAdmin(preferred);
        if (!auth.ok) {
          return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const { tenantId, adminClient } = auth.ctx;

        const { data: devices, error: devicesError } = await adminClient
          .from('gate_devices')
          .select(ADMIN_GATE_DEVICES_SELECT)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });

        if (devicesError) {
          console.error('Error fetching gate devices:', devicesError);
          return NextResponse.json(
            { error: 'Failed to fetch gate devices' },
            { status: 500 }
          );
        }

        return NextResponse.json({ devices: devices || [], tenantId });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('Gate devices API error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }
  );
}
