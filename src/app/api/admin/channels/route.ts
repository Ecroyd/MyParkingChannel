import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, createAdminClient } from '@/lib/supabase/server';

// GET - List all channels for the current tenant
export async function GET(req: NextRequest) {
  try {
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

    const { data: channels, error } = await adminSupabase
      .from('tenant_channels')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching channels:', error);
      return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 });
    }

    return NextResponse.json({ channels: channels || [] });
  } catch (error: any) {
    console.error('Channels GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new channel
export async function POST(req: NextRequest) {
  try {
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
    const { name, code, description, kind, sort_order } = body;

    if (!name || !code) {
      return NextResponse.json(
        { error: 'Missing required fields: name, code' },
        { status: 400 }
      );
    }

    // Validate code format (lowercase, alphanumeric + underscore)
    const codeRegex = /^[a-z0-9_]+$/;
    if (!codeRegex.test(code)) {
      return NextResponse.json(
        { error: 'Code must be lowercase alphanumeric with underscores only' },
        { status: 400 }
      );
    }

    const { data: channel, error } = await adminSupabase
      .from('tenant_channels')
      .insert({
        tenant_id: tenantId,
        name,
        code: code.toLowerCase(),
        description: description || null,
        kind: kind || 'generic',
        sort_order: sort_order || 100,
        is_active: true,
        is_default: false,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        // Unique constraint violation
        return NextResponse.json(
          { error: 'A channel with this code already exists' },
          { status: 400 }
        );
      }
      console.error('Error creating channel:', error);
      return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 });
    }

    return NextResponse.json({ channel }, { status: 201 });
  } catch (error: any) {
    console.error('Channels POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

