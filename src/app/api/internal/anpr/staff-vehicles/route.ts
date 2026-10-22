// GET /api/internal/anpr/staff-vehicles - Get staff vehicles for a tenant
// Authenticated via relay token (see src/lib/anpr/relayTokenAuth.ts)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getRelayTokenFromRequest, verifyRelayToken } from '@/lib/anpr/relayTokenAuth';

export async function GET(req: NextRequest) {
  try {
    // Get tenantId from query params
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId query parameter is required' },
        { status: 400 }
      );
    }

    // Authenticate relay token (Bearer / x-relay-token / ?token=). Accepts the tenant_secrets
    // relay token, the anpr_sites hash (rotate-token) or the legacy env token.
    const relayAuth = await verifyRelayToken(tenantId, getRelayTokenFromRequest(req));
    if (!relayAuth.ok) {
      return NextResponse.json(
        { error: relayAuth.status === 401 ? 'Invalid relay token' : relayAuth.error },
        { status: relayAuth.status }
      );
    }
    const supabase = createAdminClient();

    // Fetch active staff vehicles for this tenant
    const { data: vehicles, error: fetchError } = await supabase
      .from('staff_vehicles')
      .select('plate, description')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('plate', { ascending: true });

    if (fetchError) {
      console.error('[ANPR Staff Vehicles] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch staff vehicles' },
        { status: 500 }
      );
    }

    // Format response
    const formattedVehicles = (vehicles || []).map((vehicle) => ({
      plate: vehicle.plate,
      description: vehicle.description || null,
    }));

    return NextResponse.json({
      ok: true,
      vehicles: formattedVehicles,
      count: formattedVehicles.length,
    });
  } catch (error: any) {
    console.error('[ANPR Staff Vehicles] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

