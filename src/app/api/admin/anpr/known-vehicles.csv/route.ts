// GET /api/admin/anpr/known-vehicles.csv
// CSV export of known vehicles for ANPR vendor import (authenticated admin endpoint)

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { generateKnownVehiclesCsv } from '@/lib/anpr/knownVehiclesCsv';

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const adminClient = createAdminClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Get tenant context (includes tenantId, tenantSlug, role)
  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: 'No tenant context' }, { status: 403 });
  }

  // Verify user has admin access to this tenant
  if (ctx.role !== 'admin' && ctx.role !== 'owner') {
    return NextResponse.json({ error: 'Access denied. Admin role required.' }, { status: 403 });
  }

  const tenantId = ctx.tenantId;
  const tenantSlug = ctx.tenantSlug;

  try {
    // Generate CSV using shared helper
    const csv = await generateKnownVehiclesCsv(tenantId, adminClient);

    const now = new Date();
    const dateStamp = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
    const safeSlug = (tenantSlug || 'tenant').replace(/[^a-z0-9-_]/gi, '_');
    const filename = `known-vehicles-${safeSlug}-${dateStamp}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Admin CSV export error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
