// src/app/api/admin/cavu/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { syncCavuEventsForTenant } from '@/lib/suppliers/cavuEventsSync';
import { writeCavuHealthForTenant } from '@/lib/health/cavuWrite';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { tenantId?: string; hours?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const tenantId = body?.tenantId || ctx.tenantId;
    const hours =
      typeof body?.hours === 'number' && body.hours > 0 ? body.hours : 12;

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: 'Missing tenantId' },
        { status: 400 }
      );
    }

    if (tenantId !== ctx.tenantId) {
      return NextResponse.json(
        { ok: false, error: 'Cannot sync other tenants' },
        { status: 403 }
      );
    }

    await writeCavuHealthForTenant(tenantId, { status: 'running', last_error: null });

    const result = await syncCavuEventsForTenant(tenantId, { hours });

    const failed = (result.errors?.length ?? 0) > 0;
    await writeCavuHealthForTenant(tenantId, {
      status: failed ? 'failed' : 'success',
      last_error: failed ? result.errors[0] : null,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[CAVU ADMIN EVENTS SYNC] error', err);
    try {
      const ctx = await getCurrentTenantContext();
      if (ctx?.tenantId) {
        await writeCavuHealthForTenant(ctx.tenantId, {
          status: 'failed',
          last_error: message,
        });
      }
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
