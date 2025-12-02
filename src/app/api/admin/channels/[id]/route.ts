import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, createAdminClient } from '@/lib/supabase/server';

// PUT - Update a channel
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
    const { name, description, kind, is_active, sort_order } = body;

    // Verify channel belongs to tenant
    const { data: existing, error: fetchError } = await adminSupabase
      .from('tenant_channels')
      .select('id, tenant_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const { data: channel, error } = await adminSupabase
      .from('tenant_channels')
      .update({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(kind !== undefined && { kind }),
        ...(is_active !== undefined && { is_active }),
        ...(sort_order !== undefined && { sort_order }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      console.error('Error updating channel:', error);
      return NextResponse.json({ error: 'Failed to update channel' }, { status: 500 });
    }

    return NextResponse.json({ channel });
  } catch (error: any) {
    console.error('Channels PUT error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete a channel (soft delete by setting is_active=false)
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

    // Check if channel is used by any API keys
    const { data: apiKeys, error: keysError } = await adminSupabase
      .from('partner_api_keys')
      .select('id, name')
      .eq('channel_id', id)
      .limit(1);

    if (keysError) {
      console.error('Error checking API keys:', keysError);
    }

    if (apiKeys && apiKeys.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete channel: it is linked to ${apiKeys.length} API key(s). Please unlink the keys first.`,
        },
        { status: 400 }
      );
    }

    // Soft delete by setting is_active=false
    const { error } = await adminSupabase
      .from('tenant_channels')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('Error deleting channel:', error);
      return NextResponse.json({ error: 'Failed to delete channel' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Channels DELETE error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

