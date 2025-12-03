import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, createAdminClient } from '@/lib/supabase/server';

/**
 * PUT /api/admin/dynamic-pricing/rules/[id]
 * Update a dynamic pricing rule
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = await createAdminClient();
    const { data: userTenants, error: tenantError } = await adminSupabase
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (tenantError || !userTenants || userTenants.length === 0) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 404 });
    }

    const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
    const tenantId = userTenant.tenant_id;

    const body = await req.json();
    const { threshold_percent, price_increase_percent, is_active, sort_order } = body;

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (threshold_percent !== undefined) {
      if (typeof threshold_percent !== 'number' || threshold_percent < 0 || threshold_percent > 100) {
        return NextResponse.json(
          { error: 'threshold_percent must be a number between 0 and 100' },
          { status: 400 }
        );
      }
      updateData.threshold_percent = threshold_percent;
    }

    if (price_increase_percent !== undefined) {
      if (typeof price_increase_percent !== 'number' || price_increase_percent < 0) {
        return NextResponse.json(
          { error: 'price_increase_percent must be a non-negative number' },
          { status: 400 }
        );
      }
      updateData.price_increase_percent = price_increase_percent;
    }

    if (is_active !== undefined) {
      updateData.is_active = is_active;
    }

    if (sort_order !== undefined) {
      updateData.sort_order = sort_order;
    }

    const { data: rule, error } = await adminSupabase
      .from('tenant_dynamic_pricing_rules')
      .update(updateData)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('Error updating dynamic pricing rule:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json(rule);
  } catch (error: any) {
    console.error('Error in PUT /api/admin/dynamic-pricing/rules/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/dynamic-pricing/rules/[id]
 * Delete a dynamic pricing rule
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = await createAdminClient();
    const { data: userTenants, error: tenantError } = await adminSupabase
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (tenantError || !userTenants || userTenants.length === 0) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 404 });
    }

    const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
    const tenantId = userTenant.tenant_id;

    const { error } = await adminSupabase
      .from('tenant_dynamic_pricing_rules')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error deleting dynamic pricing rule:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/admin/dynamic-pricing/rules/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

