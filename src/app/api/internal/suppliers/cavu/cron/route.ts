import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { syncCavuEventsForTenant } from '@/lib/suppliers/cavuEventsSync';

async function runCavuCron() {
  const supabase = createAdminClient();

  // Get all tenants that have a CAVU config
  const { data: configs, error } = await supabase
    .from('tenant_supplier_configs')
    .select('tenant_id')
    .eq('supplier_code', 'cavu');

  if (error) {
    console.error('[CAVU CRON] Failed to load configs', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const logs: any[] = [];
  let totalEvents = 0;
  let totalBookings = 0;

  for (const config of configs ?? []) {
    const tenantId = config.tenant_id;

    try {
      const result = await syncCavuEventsForTenant(tenantId, {
        hours: 2, // TEMP: last 3 days so we can see some events
      });

      logs.push({
        tenantId,
        eventsSeen: result.eventsSeen,
        bookingsUpserted: result.bookingsUpserted,
        bookingsCancelled: result.bookingsCancelled,
        errors: result.errors,
      });

      totalEvents += result.eventsSeen;
      totalBookings += result.bookingsUpserted;
    } catch (err: any) {
      console.error('[CAVU CRON] Error for tenant', tenantId, err);
      logs.push({
        tenantId,
        error: err?.message ?? String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    tenantsProcessed: configs?.length ?? 0,
    totalEvents,
    totalBookings,
    logs,
  });
}

// Allow both GET and POST so it's easy to test + works with QStash
export async function GET() {
  return runCavuCron();
}

export async function POST() {
  return runCavuCron();
}
