// src/app/api/admin/settings/alert-routes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = req.nextUrl.searchParams.get('tenantId') || ctx.tenantId;

    // Ensure user can only access their own tenant
    if (tenantId !== ctx.tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminClient();

    const { data: routes, error } = await supabase
      .from('tenant_alert_routes')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, routes: routes || [] });
  } catch (err: any) {
    console.error('[ALERT ROUTES] GET error', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId, kind, destination, config, routeId } = body;

    const effectiveTenantId = tenantId || ctx.tenantId;

    // Ensure user can only modify their own tenant
    if (effectiveTenantId !== ctx.tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!kind || !destination) {
      return NextResponse.json(
        { ok: false, error: 'kind and destination are required' },
        { status: 400 }
      );
    }

    if (kind !== 'email' && kind !== 'webhook') {
      return NextResponse.json(
        { ok: false, error: 'kind must be email or webhook' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    if (routeId) {
      // Update existing route
      const { error } = await supabase
        .from('tenant_alert_routes')
        .update({
          kind,
          destination,
          config: config || {},
          updated_at: new Date().toISOString(),
        })
        .eq('id', routeId)
        .eq('tenant_id', effectiveTenantId);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    } else {
      // Create new route
      const { error } = await supabase
        .from('tenant_alert_routes')
        .insert({
          tenant_id: effectiveTenantId,
          kind,
          destination,
          config: config || {},
          is_enabled: true,
        });

      if (error) {
        // Check if it's a unique constraint violation
        if (error.code === '23505') {
          return NextResponse.json(
            { ok: false, error: 'Route with this destination already exists' },
            { status: 400 }
          );
        }
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[ALERT ROUTES] POST error', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId, routeId, is_enabled } = body;

    const effectiveTenantId = tenantId || ctx.tenantId;

    // Ensure user can only modify their own tenant
    if (effectiveTenantId !== ctx.tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!routeId || typeof is_enabled !== 'boolean') {
      return NextResponse.json(
        { ok: false, error: 'routeId and is_enabled are required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('tenant_alert_routes')
      .update({
        is_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', routeId)
      .eq('tenant_id', effectiveTenantId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[ALERT ROUTES] PATCH error', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId, routeId } = body;

    const effectiveTenantId = tenantId || ctx.tenantId;

    // Ensure user can only modify their own tenant
    if (effectiveTenantId !== ctx.tenantId) {
      return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    if (!routeId) {
      return NextResponse.json(
        { ok: false, error: 'routeId is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('tenant_alert_routes')
      .delete()
      .eq('id', routeId)
      .eq('tenant_id', effectiveTenantId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[ALERT ROUTES] DELETE error', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
