// src/app/api/admin/bookings/[id]/gate-status/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

const bodySchema = z.object({
  gateStatus: z.enum(['reserved', 'arrived', 'departed']),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { gateStatus } = bodySchema.parse(await req.json());
    const { id: bookingId } = await params;

    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
    }

    // Get user's tenant
    const { data: userTenants, error: userTenantsError } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (userTenantsError || !userTenants?.length) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 403 });
    }

    // Get the default tenant or first tenant
    const defaultTenant = userTenants.find(ut => ut.is_default) || userTenants[0];
    const tenantId = defaultTenant.tenant_id;

    // First, get the current booking to check existing timestamps
    const { data: currentBooking } = await adminClient
      .from('bookings')
      .select('checked_in_at, checked_out_at')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .single();

    const now = new Date().toISOString();

    let updates: {
      checked_in_at?: string | null;
      checked_out_at?: string | null;
      status?: string;
    } = {};

    switch (gateStatus) {
      case 'reserved':
        // Reset both timestamps and set status to reserved
        updates = {
          checked_in_at: null,
          checked_out_at: null,
          status: 'reserved',
        };
        break;
      case 'arrived':
        updates = {
          // Set check-in time (can override existing)
          checked_in_at: now,
          checked_out_at: null,
          status: 'checked_in',
        };
        break;
      case 'departed':
        updates = {
          // Set check-out time
          checked_out_at: now,
          // Only set checked_in_at if it's currently null
          checked_in_at: currentBooking?.checked_in_at || now,
          status: 'checked_out',
        };
        break;
    }

    const { data, error } = await adminClient
      .from('bookings')
      .update(updates)
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating gate status', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ booking: data }, { status: 200 });
  } catch (err: any) {
    console.error('Gate status API error', err);
    return NextResponse.json(
      { error: err?.message ?? 'Unknown error' },
      { status: 400 }
    );
  }
}

