// src/app/api/admin/cavu/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { syncCavuArrivalsForTenant } from '@/lib/suppliers/cavuSync';

export async function POST(req: NextRequest) {
  try {
    // Get tenant context from authenticated user
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Use tenantId from context (secure) or allow override from body for testing
    const tenantId = body?.tenantId || ctx.tenantId;
    const daysPast = typeof body?.daysPast === 'number' ? body.daysPast : 7;
    const daysFuture = typeof body?.daysFuture === 'number' ? body.daysFuture : 365;

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: 'Missing tenantId' },
        { status: 400 }
      );
    }

    // Ensure user can only sync their own tenant
    if (tenantId !== ctx.tenantId) {
      return NextResponse.json(
        { ok: false, error: 'Cannot sync other tenants' },
        { status: 403 }
      );
    }

    const result = await syncCavuArrivalsForTenant(tenantId, {
      daysPast,
      daysFuture,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[CAVU ADMIN SYNC] error', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
