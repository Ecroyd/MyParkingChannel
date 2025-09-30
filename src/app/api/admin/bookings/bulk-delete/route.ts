import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

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

    // Delete the bookings
    const { error: deleteError } = await adminClient
      .from('bookings')
      .delete()
      .in('id', bookingIds);

    if (deleteError) {
      console.error('Error deleting bookings:', deleteError);
      return NextResponse.json({ error: 'Failed to delete bookings' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      deletedCount: bookingIds.length 
    });

  } catch (error) {
    console.error('Bulk delete error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
