// POST /api/admin/anpr-sites/emit-snapshot - Manually emit outbox snapshot

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getServerSupabase } from '@/lib/supabase/server';

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

    // Insert snapshot outbox item
    const { data: outboxItem, error: insertError } = await adminClient
      .from('anpr_outbox')
      .insert({
        tenant_id: tenantId,
        type: 'snapshot',
        reason: 'manual',
        status: 'pending',
        plate: '', // Snapshot items don't need plate
        group_number: 0,
        valid_from: new Date().toISOString(),
        valid_until: new Date().toISOString(),
        action: 'snapshot',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting snapshot outbox item:', insertError);
      return NextResponse.json(
        { error: 'Failed to emit snapshot' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      outboxItemId: outboxItem.id,
    });
  } catch (error: any) {
    console.error('POST /api/admin/anpr-sites/emit-snapshot error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

