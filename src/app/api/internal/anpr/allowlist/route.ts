// GET /api/internal/anpr/allowlist - The plates an on-site gateway should hold in the ANPR
// cameras' allow-lists (bookings with validity windows, cars on site, staff vehicles). The gateway
// makes the cameras match this whole list, so there is no queue to lose or to share with other
// relays. Authenticated with the gateway's own key (x-gateway-key) or the tenant relay token.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { authenticateGatewayRequest } from '@/lib/anpr/gatewayDevice';
import { loadAllowList } from '@/lib/anpr/allowList';

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const auth = await authenticateGatewayRequest(req, supabase, tenantId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const now = new Date();
    const entries = await loadAllowList(supabase, tenantId, now);
    return NextResponse.json({ ok: true, generatedAt: now.toISOString(), count: entries.length, entries });
  } catch (error: unknown) {
    console.error('[ANPR Allow-list] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
