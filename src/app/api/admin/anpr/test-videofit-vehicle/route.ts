// Test Videofit by sending a test vehicle record
// POST /api/admin/anpr/test-videofit-vehicle?tenantId=...

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendDbBulkUpdate, type VideofitConfig, type VideofitRow } from '@/lib/videofit/sendDbBulkUpdate';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
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

    // Get Videofit config from tenant_secrets (column-based storage)
    const { data: secret } = await adminClient
      .from('tenant_secrets')
      .select('videofit_base_url, videofit_site_client_license, videofit_loc_pc_no, videofit_default_group')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!secret) {
      return NextResponse.json(
        { error: 'Videofit not configured. Please set Videofit settings in ANPR configuration.' },
        { status: 400 }
      );
    }

    const baseUrl = secret.videofit_base_url;
    const siteClientLicense = secret.videofit_site_client_license
      ? parseInt(String(secret.videofit_site_client_license), 10)
      : 0;
    const locPcNo = secret.videofit_loc_pc_no
      ? parseInt(String(secret.videofit_loc_pc_no), 10)
      : 0;
    const defaultGroup = secret.videofit_default_group
      ? parseInt(String(secret.videofit_default_group), 10)
      : 4;

    if (!baseUrl || !siteClientLicense) {
      return NextResponse.json(
        { error: 'Videofit configuration incomplete. Please set Base URL and Site Client License.' },
        { status: 400 }
      );
    }

    const config: VideofitConfig = {
      baseUrl,
      siteClientLicense,
      locPcNo,
      defaultGroup,
    };

    // Create test record: TEST123 valid for 10 minutes
    const now = new Date();
    const validUntil = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now

    const testRow: VideofitRow = {
      plate: 'TEST123',
      group: defaultGroup,
      validFrom: now,
      validUntil: validUntil,
      action: 'upsert',
    };

    // Send test update
    const result = await sendDbBulkUpdate(config, [testRow]);

    // Log integration event
    const idempotencyKey = `videofit_test_vehicle_${tenantId}_${Date.now()}`;
    const payload = {
      test: true,
      rows: [testRow],
    };
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    await adminClient.from('integration_events').insert({
      tenant_id: tenantId,
      direction: 'outbound',
      event_type: 'videofit_send_db_bulk_update',
      idempotency_key: idempotencyKey,
      payload_hash: payloadHash,
      status: result.success ? 'success' : 'failed',
      http_status: result.statusCode || null,
      duration_ms: result.durationMs || null,
      payload: payload,
      response: result.response || null,
      error: result.error || null,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Test vehicle sent successfully. Check Videofit Database list to confirm receipt.',
        plate: 'TEST123',
        group: defaultGroup,
        durationMs: result.durationMs,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Unknown error',
          statusCode: result.statusCode,
          response: result.response,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Videofit test vehicle error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
