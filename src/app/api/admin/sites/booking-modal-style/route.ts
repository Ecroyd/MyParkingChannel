import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function PUT(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const adminClient = await createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { siteId, bookingModalStyle } = await req.json();

    if (!siteId || !bookingModalStyle) {
      return NextResponse.json(
        { error: 'siteId and bookingModalStyle are required' },
        { status: 400 }
      );
    }

    if (bookingModalStyle !== 'card' && bookingModalStyle !== 'banner') {
      return NextResponse.json(
        { error: 'bookingModalStyle must be either "card" or "banner"' },
        { status: 400 }
      );
    }

    // Get the site to verify tenant access
    const { data: site, error: siteError } = await adminClient
      .from('sites')
      .select('tenant_id')
      .eq('id', siteId)
      .single();

    if (siteError || !site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }

    // Verify user has access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', site.tenant_id)
      .maybeSingle();

    if (!userTenant || (userTenant.role !== 'admin' && userTenant.role !== 'owner')) {
      return NextResponse.json(
        { error: 'Access denied. Admin role required.' },
        { status: 403 }
      );
    }

    // Update the site's booking modal style
    const { data: updatedSite, error: updateError } = await adminClient
      .from('sites')
      .update({ booking_modal_style: bookingModalStyle })
      .eq('id', siteId)
      .select('id, booking_modal_style')
      .single();

    if (updateError) {
      console.error('Error updating booking modal style:', updateError);
      return NextResponse.json(
        { error: 'Failed to update booking modal style' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedSite
    });
  } catch (error: any) {
    console.error('PUT /api/admin/sites/booking-modal-style error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
