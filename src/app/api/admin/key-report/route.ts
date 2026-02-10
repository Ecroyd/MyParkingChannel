import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { createAdminClient } from '@/lib/supabase/server-admin';

export const dynamic = 'force-dynamic';

// Today page dropdown writes to gate_status (not ops_status). Key Report must match.
const GATE_TAKE_KEY = 'take_key';
const GATE_ARRIVED_KEY_TAKEN = 'arrived_key_taken';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const tenantId = ctx.tenantId;
    const adminClient = createAdminClient();

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get('tab'); // 'take_key' | 'arrived_key_taken'
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const gateStatusFilter = tab === 'arrived_key_taken'
      ? GATE_ARRIVED_KEY_TAKEN
      : GATE_TAKE_KEY;

    const fromDate = from ? new Date(from + 'T00:00:00.000Z').toISOString() : null;
    const toDate = to ? new Date(to + 'T23:59:59.999Z').toISOString() : null;
    const now = new Date().toISOString();

    let query = adminClient
      .from('bookings')
      .select('id, tenant_id, reference, customer_name, customer_email, plate, start_at, end_at, status, gate_status, highlight_code, created_at')
      .eq('tenant_id', tenantId)
      .eq('gate_status', gateStatusFilter)
      .order('start_at', { ascending: false });

    // Include: (booking overlaps [from, to]) OR (currently parked: start_at <= now <= end_at)
    if (fromDate && toDate) {
      query = query.or(
        `and(end_at.gte.${fromDate},start_at.lte.${toDate}),and(start_at.lte.${now},end_at.gte.${now})`
      );
    } else {
      if (fromDate) query = query.gte('end_at', fromDate);
      if (toDate) query = query.lte('start_at', toDate);
    }

    const { data: bookings, error: queryError } = await query;

    if (queryError) {
      console.error('Key report API error', queryError);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    return NextResponse.json({ bookings: bookings || [] });
  } catch (err: any) {
    console.error('Key report API error', err);
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
