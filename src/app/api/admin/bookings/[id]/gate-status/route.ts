// src/app/api/admin/bookings/[id]/gate-status/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

// Canonical gate status: none (null), arrived, no_show, take_key, arrived_key_taken, departed; legacy reserved/cancelled for parked
const bodySchema = z.object({
  gateStatus: z
    .enum([
      'reserved',
      'arrived',
      'departed',
      'cancelled',
      'no_show',
      'take_key',
      'arrived_key_taken',
    ])
    .nullable(),
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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
    }

    const { data: userTenants, error: userTenantsError } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (userTenantsError || !userTenants?.length) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 403 });
    }

    const defaultTenant = userTenants.find(ut => ut.is_default) || userTenants[0];
    const tenantId = defaultTenant.tenant_id;
    const userId = user.id;
    const now = new Date().toISOString();

    const { data: currentBooking } = await adminClient
      .from('bookings')
      .select('checked_in_at, checked_out_at')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .single();

    type UpdatePayload = {
      gate_status: string | null;
      checked_in_at?: string | null;
      checked_out_at?: string | null;
      status?: string;
      highlight_code?: string;
      ops_hidden?: boolean;
      ops_hidden_reason?: string | null;
      ops_hidden_at?: string | null;
      ops_hidden_by?: string | null;
    };

    let updates: UpdatePayload = {
      gate_status: gateStatus,
    };

    switch (gateStatus) {
      case null:
        break;
      case 'reserved':
        updates = {
          ...updates,
          checked_in_at: null,
          checked_out_at: null,
          status: 'reserved',
        };
        break;
      case 'arrived':
        updates = {
          ...updates,
          checked_in_at: now,
          checked_out_at: null,
          status: 'checked_in',
        };
        break;
      case 'no_show':
        updates = {
          ...updates,
          ops_hidden: true,
          ops_hidden_reason: 'no_show',
          ops_hidden_at: now,
          ops_hidden_by: userId,
        };
        break;
      case 'take_key':
        updates = {
          ...updates,
          highlight_code: 'key',
          checked_in_at: now,
          checked_out_at: null,
          status: 'checked_in',
        };
        break;
      case 'arrived_key_taken':
        updates = {
          ...updates,
          highlight_code: 'key',
          checked_in_at: currentBooking?.checked_in_at || now,
          checked_out_at: null,
          status: 'checked_in',
        };
        break;
      case 'departed':
        // Soft-hide: set gate_status and hide from default Departures list; "Show hidden" reveals.
        updates = {
          ...updates,
          checked_out_at: now,
          checked_in_at: currentBooking?.checked_in_at || now,
          status: 'checked_out',
          ops_hidden: true,
          ops_hidden_reason: 'departed',
          ops_hidden_at: now,
          ops_hidden_by: userId,
        };
        break;
      case 'cancelled':
        // Soft-hide: cancelled bookings disappear from default list; "Show hidden" reveals.
        updates = {
          ...updates,
          checked_in_at: null,
          checked_out_at: null,
          status: 'cancelled',
          ops_hidden: true,
          ops_hidden_reason: 'cancelled',
          ops_hidden_at: now,
          ops_hidden_by: userId,
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

    // Sync to Videofit if configured (fire and forget)
    if (data && (gateStatus === 'cancelled' || updates.status === 'cancelled')) {
      const { syncBookingToVideofit } = await import('@/lib/videofit/bookingSync');
      void syncBookingToVideofit(
        {
          id: data.id,
          tenant_id: data.tenant_id,
          plate: data.plate,
          start_at: data.start_at,
          end_at: data.end_at,
          status: 'cancelled',
        },
        'cancelled',
        adminClient
      ).catch((err) => console.error('[Videofit] Background sync error:', err));
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

