import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { syncCavuEventsForTenant } from '@/lib/suppliers/cavuEventsSync';

// This endpoint is triggered by Vercel Cron
export async function GET() {
  const supabase = createAdminClient();

  // Fetch all tenants that have CAVU enabled
  const { data: configs, error } = await supabase
    .from('tenant_supplier_configs')
    .select('tenant_id, supplier_code')
    .eq('supplier_code', 'cavu');

  if (error) {
    console.error('[CAVU CRON] Failed to load configs', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let totalBookings = 0;
  let totalEvents = 0;
  
  const tenantLogs: any[] = [];

  for (const config of configs ?? []) {
    const tenantId = config.tenant_id;

    try {
      const result = await syncCavuEventsForTenant(tenantId, {
        hours: 2,   // last 2 hours of changes
      });

      totalEvents += result.eventsSeen;
      totalBookings += result.bookingsUpserted;

      tenantLogs.push({
        tenantId,
        eventsSeen: result.eventsSeen,
        bookingsUpserted: result.bookingsUpserted,
        bookingsCancelled: result.bookingsCancelled,
        errors: result.errors,
      });

    } catch (err: any) {
      tenantLogs.push({
        tenantId,
        error: err.message ?? String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    totalEvents,
    totalBookings,
    tenantsProcessed: (configs ?? []).length,
    tenantLogs,
  });
}

