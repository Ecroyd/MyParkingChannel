// POST /api/internal/anpr/heartbeat - Keep an on-site ANPR gateway marked connected
// Authenticated via per-tenant relay token (x-relay-token header or Bearer)
// Body: { device_id } — the gateway's gate_devices id. Reads sent to /capture with the same
// device_id also count, so this only matters when no vehicles are moving.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRelayAuth } from '../_relayAuth';
import { touchGatewayDevice } from '@/lib/anpr/gatewayDevice';

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    }

    const auth = await requireRelayAuth(req, tenantId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => null);
    const touched = await touchGatewayDevice(createAdminClient(), tenantId, body?.device_id);
    if (!touched.ok) {
      return NextResponse.json({ error: touched.error }, { status: touched.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('[ANPR Heartbeat] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
