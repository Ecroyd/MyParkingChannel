// GET /api/integrations/anpr/known-vehicles.csv?tenant=<tenantId>&token=<rawToken>
// Unauthenticated CSV export for ANPR vendor hourly sync

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { generateKnownVehiclesCsv } from '@/lib/anpr/knownVehiclesCsv';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenant');
    const rawToken = searchParams.get('token');

    if (!tenantId || !rawToken) {
      return NextResponse.json(
        { error: 'tenant and token query parameters are required' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 1) First verify tenant exists (resolve tenant ONLY from query param)
    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select('id, slug')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Tenant not found' },
        { status: 404 }
      );
    }

    // 2) Query tenant_anpr_config for that tenant
    const { data: config, error: configError } = await adminClient
      .from('tenant_anpr_config')
      .select('tenant_id, csv_token_hash')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    // 3) If no config row -> return 404 "tenant not configured"
    if (configError || !config) {
      return NextResponse.json(
        { error: 'Tenant not configured for CSV export' },
        { status: 404 }
      );
    }

    // 4) Normalize token (strip braces/quotes) and validate
    const normalizedToken = rawToken.replace(/[{}'"]/g, '').trim();
    const tokenHash = crypto.createHash('sha256').update(normalizedToken).digest('hex');

    if (!config.csv_token_hash || config.csv_token_hash !== tokenHash) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Generate CSV using shared helper
    const csv = await generateKnownVehiclesCsv(tenantId, adminClient);

    const now = new Date();
    const dateStamp = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    const safeSlug = (tenant.slug || 'tenant').replace(/[^a-z0-9-_]/gi, '_');
    const filename = `known-vehicles-${safeSlug}-${dateStamp}.csv`;

    // Return CSV response
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('Hosted CSV export error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
