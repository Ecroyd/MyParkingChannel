// POST /api/gateway/pair - Called by the on-site ANPR gateway app's setup screen.
// Body: { code, name? }. Consumes the tenant's one-time pairing code (issued on the admin ANPR
// settings page), creates a gate device for the gateway and returns its credentials. The device
// key is returned only here; the gateway stores it locally and sends it as x-gateway-key.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { redeemPairingCode } from '@/lib/anpr/gatewayPairing';
import { createGatewayDevice } from '@/lib/anpr/gatewayDevice';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const supabase = createAdminClient();

    const redeemed = await redeemPairingCode(supabase, body?.code);
    if (!redeemed) {
      return NextResponse.json(
        { error: 'That pairing code is wrong, expired or already used. Get a new one in Admin → Settings → ANPR.' },
        { status: 400 }
      );
    }

    const label = String(body?.name ?? '').replace(/[^\w .-]/g, '').trim().slice(0, 60);
    const { deviceId, deviceKey } = await createGatewayDevice(
      supabase,
      redeemed.tenantId,
      label ? `ANPR gateway (${label})` : 'ANPR gateway'
    );

    const { data: tenant } = await supabase.from('tenants').select('name').eq('id', redeemed.tenantId).maybeSingle();

    return NextResponse.json({
      tenantId: redeemed.tenantId,
      tenantName: tenant?.name ?? null,
      deviceId,
      deviceKey,
    });
  } catch (error: unknown) {
    console.error('[ANPR gateway pair] error:', error);
    return NextResponse.json({ error: 'Pairing failed. Please try again.' }, { status: 500 });
  }
}
