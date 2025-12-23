// POST /api/admin/anpr-sites/emit-snapshot - Manually emit outbox snapshot
// Generates full snapshot from bookings and inserts/updates outbox items

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { generateAnprSnapshot } from '@/lib/anpr/generateSnapshot';

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // Verify user has admin access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!userTenant || (userTenant.role !== 'admin' && userTenant.role !== 'owner')) {
      return NextResponse.json({ error: 'Access denied. Admin role required.' }, { status: 403 });
    }

    // Generate snapshot and insert/update outbox items
    const snapshotResult = await generateAnprSnapshot(tenantId, adminClient, 'manual');

    if (snapshotResult.errors.length > 0) {
      console.error('Error generating snapshot:', snapshotResult.errors);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to generate snapshot',
          details: snapshotResult.errors,
          inserted: snapshotResult.inserted,
          updated: snapshotResult.updated,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      inserted: snapshotResult.inserted,
      updated: snapshotResult.updated,
      message: `Snapshot generated: ${snapshotResult.inserted} inserted, ${snapshotResult.updated} updated`,
    });
  } catch (error: any) {
    console.error('POST /api/admin/anpr-sites/emit-snapshot error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

