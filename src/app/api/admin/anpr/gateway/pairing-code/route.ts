// POST /api/admin/anpr/gateway/pairing-code - Issue a one-time code for setting up the on-site
// ANPR gateway app. Replaces any earlier unused code. Admins only: pairing creates a device
// credential.

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthorizedAnprAdmin } from '@/lib/anpr/adminAnprAuth';
import { roleAtLeast } from '@/lib/auth/permissions';
import { GATEWAY_DOWNLOAD_URL, issuePairingCode } from '@/lib/anpr/gatewayPairing';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const auth = await resolveAuthorizedAnprAdmin(body?.tenantId ?? null);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!roleAtLeast(auth.ctx.role, 'admin')) {
      return NextResponse.json({ error: 'Only admins can pair a gateway' }, { status: 403 });
    }

    const { code, expiresAt } = await issuePairingCode(auth.ctx.adminClient, auth.ctx.tenantId, auth.ctx.userId);
    return NextResponse.json({ code, expiresAt, downloadUrl: GATEWAY_DOWNLOAD_URL });
  } catch (error: unknown) {
    console.error('[ANPR gateway pairing-code] error:', error);
    return NextResponse.json({ error: 'Could not create a pairing code' }, { status: 500 });
  }
}
