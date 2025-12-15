// src/app/api/internal/suppliers/cavu/no-show/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getCavuConfigForTenant } from '@/lib/suppliers/getTenantSupplierConfig';
import { registerNoShow } from '@/lib/suppliers/cavu';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, bookingReference } = body;

    if (!tenantId || !bookingReference) {
      return NextResponse.json(
        { error: 'Missing tenantId or bookingReference' },
        { status: 400 }
      );
    }

    const config = await getCavuConfigForTenant(tenantId);
    if (!config) {
      return NextResponse.json(
        { error: 'No CAVU config for tenant' },
        { status: 400 }
      );
    }

    // Register no-show with CAVU
    await registerNoShow(config, bookingReference);

    // Update booking status in our database
    const supabase = createAdminClient();
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, notes')
      .eq('tenant_id', tenantId)
      .eq('reference', bookingReference)
      .single();

    if (booking) {
      const existingNotes = booking.notes || '';
      const noShowNote = existingNotes
        ? `${existingNotes}\n[CAVU] No-show registered at ${new Date().toISOString()}`
        : `[CAVU] No-show registered at ${new Date().toISOString()}`;

      await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          notes: noShowNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking.id);
    }

    return NextResponse.json({
      success: true,
      message: 'No-show registered successfully',
    });
  } catch (err: any) {
    console.error('[CAVU] Register no-show error', err);
    return NextResponse.json(
      { error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

