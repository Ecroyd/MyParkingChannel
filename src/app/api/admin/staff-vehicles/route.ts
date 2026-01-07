// GET /api/admin/staff-vehicles - List staff vehicles for a tenant
// POST /api/admin/staff-vehicles - Create a new staff vehicle

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/server';

function normalisePlate(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify user has access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!userTenant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch staff vehicles
    const { data: vehicles, error: vehiclesError } = await adminClient
      .from('staff_vehicles')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (vehiclesError) {
      console.error('Error fetching staff vehicles:', vehiclesError);
      return NextResponse.json(
        { error: 'Failed to fetch staff vehicles' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: vehicles || [] });
  } catch (error: any) {
    console.error('GET /api/admin/staff-vehicles error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, plate, description } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    if (!plate) {
      return NextResponse.json({ error: 'plate is required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
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

    // Normalise plate number
    const normalisedPlate = normalisePlate(plate);

    // Check if vehicle already exists
    const { data: existing } = await adminClient
      .from('staff_vehicles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('plate', normalisedPlate)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'A staff vehicle with this plate already exists' },
        { status: 409 }
      );
    }

    // Create staff vehicle
    const { data: vehicle, error: createError } = await adminClient
      .from('staff_vehicles')
      .insert({
        tenant_id: tenantId,
        plate: normalisedPlate,
        description: description || null,
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating staff vehicle:', createError);
      return NextResponse.json(
        { error: 'Failed to create staff vehicle' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: vehicle });
  } catch (error: any) {
    console.error('POST /api/admin/staff-vehicles error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

