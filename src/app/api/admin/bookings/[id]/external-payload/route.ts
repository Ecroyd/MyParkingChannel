// src/app/api/admin/bookings/[id]/external-payload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: bookingId } = await params;

    const supabase = createAdminClient();

    // First verify the booking belongs to the user's tenant
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, tenant_id, reference, source')
      .eq('id', bookingId)
      .eq('tenant_id', ctx.tenantId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Fetch external payload for this booking
    const { data: payload, error: payloadError } = await supabase
      .from('booking_external_payloads')
      .select('*')
      .eq('booking_id', bookingId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (payloadError) {
      console.error('[BOOKING EXTERNAL PAYLOAD] Error fetching payload:', payloadError);
      return NextResponse.json(
        { error: 'Failed to fetch payload' },
        { status: 500 }
      );
    }

    if (!payload) {
      return NextResponse.json(
        { error: 'No external payload found for this booking' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      payload: payload.payload,
      source: payload.source,
      reference: payload.reference,
      fetched_at: payload.fetched_at,
    });
  } catch (err: any) {
    console.error('[BOOKING EXTERNAL PAYLOAD] error', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
