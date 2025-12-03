import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { BookingHighlightCode } from '@/types/bookings';

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();

    const { bookingId, tenantId, highlightCode } = await req.json();

    if (!bookingId || !tenantId || !highlightCode) {
      return NextResponse.json(
        { error: 'Missing bookingId, tenantId or highlightCode' },
        { status: 400 }
      );
    }

    const allowed: BookingHighlightCode[] = [
      'none',
      'dot_green',
      'dot_amber',
      'dot_red',
      'key',
    ];
    if (!allowed.includes(highlightCode)) {
      return NextResponse.json(
        { error: 'Invalid highlightCode' },
        { status: 400 }
      );
    }

    // RLS should enforce tenant access, but also filter by tenantId for safety
    const { error } = await supabase
      .from('bookings')
      .update({ highlight_code: highlightCode })
      .eq('id', bookingId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[BOOKING_HIGHLIGHT_UPDATE_ERROR]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[BOOKING_HIGHLIGHT_UPDATE_UNEXPECTED]', err);
    return NextResponse.json(
      { error: 'Unexpected error updating highlight' },
      { status: 500 }
    );
  }
}

