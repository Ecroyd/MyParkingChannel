import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

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

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error('BOOKING_UPDATE_FATAL', err);
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 500 });
  }
}