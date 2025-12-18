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

    // Get Videofit config from tenant_secrets using encrypted key-value pattern
    const { data: secrets } = await adminClient
      .from('tenant_secrets')
      .select('key, value_ciphertext')
      .eq('tenant_id', tenantId)
      .eq('scope', 'anpr')
      .in('key', [
        'videofit_base_url',
        'videofit_site_client_license',
        'videofit_loc_pc_no',
        'videofit_default_group',
      ]);

    if (!secrets || secrets.length === 0) {
      return NextResponse.json(
        { error: 'Videofit not configured. Please set Videofit settings in ANPR configuration.' },
        { status: 400 }
      );
    }

    // Decrypt helper
    const decryptSecret = (encryptedValue: string): string => {
      return Buffer.from(encryptedValue, 'base64').toString();
    };

    const getValue = (key: string): string | null => {
      const secret = secrets.find((s) => s.key === key);
      if (!secret?.value_ciphertext) return null;
      try {
        return decryptSecret(secret.value_ciphertext);
      } catch {
        return null;
      }
    };

    const baseUrl = getValue('videofit_base_url');
    const siteClientLicense = getValue('videofit_site_client_license')
      ? parseInt(getValue('videofit_site_client_license')!, 10)
      : 0;
    const locPcNo = getValue('videofit_loc_pc_no')
      ? parseInt(getValue('videofit_loc_pc_no')!, 10)
      : 0;
    const defaultGroup = getValue('videofit_default_group')
      ? parseInt(getValue('videofit_default_group')!, 10)
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
