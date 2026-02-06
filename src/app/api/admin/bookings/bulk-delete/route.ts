import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { getServerSupabase } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { bookingIds, tenantId } = await req.json();

    if (!bookingIds || !Array.isArray(bookingIds) || bookingIds.length === 0) {
      return NextResponse.json({ error: 'No booking IDs provided' }, { status: 400 });
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 });
    }

    const adminClient = await createAdminClient();
    const supabase = await getServerSupabase();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id ?? null;

    // Verify all bookings belong to the tenant
    const { data: bookings, error: fetchError } = await adminClient
      .from('bookings')
      .select('id, tenant_id')
      .in('id', bookingIds);

    if (fetchError) {
      console.error('Error fetching bookings:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
    }

    // Check if all bookings belong to the tenant
    const invalidBookings = bookings?.filter(booking => booking.tenant_id !== tenantId);
    if (invalidBookings && invalidBookings.length > 0) {
      return NextResponse.json({
        error: 'Some bookings do not belong to this tenant'
      }, { status: 403 });
    }

    // Soft-hide: set ops_hidden so rows stay in DB but are filtered in UI (no hard delete)
    const { error: updateError } = await adminClient
      .from('bookings')
      .update({
        ops_hidden: true,
        ops_hidden_at: new Date().toISOString(),
        ops_hidden_by: userId,
        ops_hidden_reason: 'bulk_hidden',
      })
      .in('id', bookingIds);

    if (updateError) {
      console.error('Error hiding bookings:', updateError);
      return NextResponse.json({ error: 'Failed to hide bookings' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      hiddenCount: bookingIds.length,
    });

  } catch (error) {
    console.error('Bulk delete error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
