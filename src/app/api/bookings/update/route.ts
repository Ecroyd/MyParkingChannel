import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await getServerSupabase();

    // ensure the request is authenticated (RLS requires auth.uid())
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id, updates } = await req.json();

    const { data, error, status } = await supabase
      .from('bookings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('BOOKING_UPDATE_ERROR', { id, updates, error });
      return NextResponse.json({ error: error.message }, { status: status ?? 400 });
    }

    // Sync to Videofit if configured (fire and forget)
    if (data) {
      const { syncBookingToVideofit } = await import('@/lib/videofit/bookingSync');
      const adminClient = createAdminClient();
      void syncBookingToVideofit(
        {
          id: data.id,
          tenant_id: data.tenant_id,
          plate: data.plate,
          start_at: data.start_at,
          end_at: data.end_at,
          status: data.status,
        },
        'updated',
        adminClient
      ).catch((err) => console.error('[Videofit] Background sync error:', err));
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error('BOOKING_UPDATE_FATAL', err);
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}