// PUT /api/admin/staff-vehicles/[id] - Update a staff vehicle
// DELETE /api/admin/staff-vehicles/[id] - Delete a staff vehicle

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/server';

function normalisePlate(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vehicleId = id;
    const body = await req.json();
    const { plate, description, is_active } = body;

    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the vehicle to check tenant access
    const { data: vehicle, error: vehicleError } = await adminClient
      .from('staff_vehicles')
      .select('tenant_id')
      .eq('id', vehicleId)
      .single();

    if (vehicleError || !vehicle) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    // Verify user has admin access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', vehicle.tenant_id)
      .maybeSingle();

    if (!userTenant || (userTenant.role !== 'admin' && userTenant.role !== 'owner')) {
      return NextResponse.json({ error: 'Access denied. Admin role required.' }, { status: 403 });
    }

    // Build update object
    const updates: any = {};
    if (plate !== undefined) {
      updates.plate = normalisePlate(plate);
    }
    if (description !== undefined) {
      updates.description = description || null;
    }
    if (is_active !== undefined) {
      updates.is_active = is_active;
    }

    // Check for duplicate plate if plate is being updated
    if (updates.plate) {
      const { data: existing } = await adminClient
        .from('staff_vehicles')
        .select('id')
        .eq('tenant_id', vehicle.tenant_id)
        .eq('plate', updates.plate)
        .neq('id', vehicleId)
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: 'A staff vehicle with this plate already exists' },
          { status: 409 }
        );
      }
    }

    // Update vehicle
    const { data: updatedVehicle, error: updateError } = await adminClient
      .from('staff_vehicles')
      .update(updates)
      .eq('id', vehicleId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating staff vehicle:', updateError);
      return NextResponse.json(
        { error: 'Failed to update staff vehicle' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: updatedVehicle });
  } catch (error: any) {
    console.error('PUT /api/admin/staff-vehicles/[id] error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vehicleId = id;

    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the vehicle to check tenant access
    const { data: vehicle, error: vehicleError } = await adminClient
      .from('staff_vehicles')
      .select('tenant_id')
      .eq('id', vehicleId)
      .single();

    if (vehicleError || !vehicle) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    // Verify user has admin access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', vehicle.tenant_id)
      .maybeSingle();

    if (!userTenant || (userTenant.role !== 'admin' && userTenant.role !== 'owner')) {
      return NextResponse.json({ error: 'Access denied. Admin role required.' }, { status: 403 });
    }

    // Delete vehicle
    const { error: deleteError } = await adminClient
      .from('staff_vehicles')
      .delete()
      .eq('id', vehicleId);

    if (deleteError) {
      console.error('Error deleting staff vehicle:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete staff vehicle' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/admin/staff-vehicles/[id] error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
