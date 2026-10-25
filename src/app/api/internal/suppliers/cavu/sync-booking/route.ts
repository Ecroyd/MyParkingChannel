// src/app/api/internal/suppliers/cavu/sync-booking/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getCavuConfigForTenant } from '@/lib/suppliers/getTenantSupplierConfig';
import { getBookingDetails } from '@/lib/suppliers/cavu';
import { requireCronOrTenantMemberApi } from '@/lib/auth/apiGuards';
import { getTenantTimezone, writeCavuBooking } from '@/lib/suppliers/cavuBookingWrite';


export async function POST(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  const guard = await requireCronOrTenantMemberApi(req, tenantId, ['owner', 'admin', 'ops']);
  if (guard.response) return guard.response;
  const reference = req.nextUrl.searchParams.get('reference');

  if (!tenantId || !reference) {
    return NextResponse.json(
      { ok: false, error: 'Missing tenantId or reference' },
      { status: 400 }
    );
  }

  try {
    // Load CAVU config for tenant
    const config = await getCavuConfigForTenant(tenantId);
    if (!config) {
      return NextResponse.json(
        { ok: false, error: 'No CAVU config for tenant' },
        { status: 400 }
      );
    }

    // Fetch booking details from CAVU
    const booking = await getBookingDetails(config, reference);
    if (!booking) {
      return NextResponse.json(
        { ok: false, error: 'Booking not found in CAVU' },
        { status: 404 }
      );
    }

    const supabase = createAdminClient();
    const timezone = await getTenantTimezone(supabase, tenantId);
    let result;
    try {
      result = await writeCavuBooking(supabase, { tenantId, booking, timezone, mode: 'sync', reference });
    } catch (writeErr: any) {
      const msg = writeErr instanceof RangeError ? `invalid date (${writeErr.message})` : writeErr?.message ?? String(writeErr);
      console.error('[CAVU SYNC BOOKING] Write failed', reference, msg);
      return NextResponse.json(
        { ok: false, error: `Failed to upsert booking: ${msg}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      reference,
      updated: result.action !== 'unchanged',
      action: result.action,
    });
  } catch (err: any) {
    console.error('[CAVU SYNC BOOKING] error', err?.message ?? err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

