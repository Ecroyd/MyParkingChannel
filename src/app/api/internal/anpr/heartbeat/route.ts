// POST /api/internal/anpr/heartbeat - Keep an on-site ANPR gateway marked connected
// Authenticated with the gateway's own key (x-gateway-key; the device is implied), or with the
// tenant relay token plus body { device_id }. Reads sent to /capture also count, so this only
// matters when no vehicles are moving.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { authenticateGatewayRequest, touchGatewayDevice } from '@/lib/anpr/gatewayDevice';

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const auth = await authenticateGatewayRequest(req, supabase, tenantId, { requireEnabledSite: true });
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => null);
    const deviceId = auth.via === 'gateway_key' ? auth.deviceId : body?.device_id;
    const touched = await touchGatewayDevice(supabase, tenantId, deviceId);
    if (!touched.ok) {
      return NextResponse.json({ error: touched.error }, { status: touched.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('[ANPR Heartbeat] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
