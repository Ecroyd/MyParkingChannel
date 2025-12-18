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
        'videofit_mode',
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

    const mode = (getValue('videofit_mode') || 'relay') as 'relay' | 'direct';
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

    // Validate based on mode
    if (mode === 'relay') {
      if (!siteClientLicense || locPcNo === null || locPcNo === undefined) {
        return NextResponse.json(
          { error: 'Videofit configuration incomplete. Please set Site Client License and Location PC No.' },
          { status: 400 }
        );
      }
    } else {
      // direct mode
      if (!baseUrl || !siteClientLicense || locPcNo === null || locPcNo === undefined) {
        return NextResponse.json(
          { error: 'Videofit configuration incomplete. Please set Base URL, Site Client License, and Location PC No.' },
          { status: 400 }
        );
      }
    }

    // Create test record: TEST123 valid for 10 minutes
    const now = new Date();
    const validUntil = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now

    let result: { success: boolean; error?: string; statusCode?: number; response?: any; durationMs?: number };

    if (mode === 'relay') {
      // Relay mode: enqueue to outbox (no direct call)
      const { error: outboxError } = await adminClient.from('anpr_outbox').insert({
        tenant_id: tenantId,
        booking_id: null, // Test vehicle has no booking
        plate: 'TEST123',
        group_number: defaultGroup,
        valid_from: now.toISOString(),
        valid_until: validUntil.toISOString(),
        action: 'upsert',
        status: 'pending',
      });

      if (outboxError) {
        result = {
          success: false,
          error: outboxError.message || 'Failed to enqueue test vehicle to outbox',
        };
      } else {
        result = {
          success: true,
          durationMs: 0,
        };
      }
    } else {
      // Direct mode: call Videofit directly
      const config: VideofitConfig = {
        baseUrl: baseUrl!,
        siteClientLicense,
        locPcNo,
        defaultGroup,
      };

      const testRow: VideofitRow = {
        plate: 'TEST123',
        group: defaultGroup,
        validFrom: now,
        validUntil: validUntil,
        action: 'upsert',
      };

      result = await sendDbBulkUpdate(config, [testRow]);
    }

    // Log integration event
    const idempotencyKey = `videofit_test_vehicle_${tenantId}_${Date.now()}`;
    const payload = {
      test: true,
      mode,
      plate: 'TEST123',
      group: defaultGroup,
    };
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

    await adminClient.from('integration_events').insert({
      tenant_id: tenantId,
      direction: mode === 'relay' ? 'internal' : 'outbound',
      event_type: mode === 'relay' ? 'videofit_outbox_insert' : 'videofit_send_db_bulk_update',
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
      const message =
        mode === 'relay'
          ? 'Test vehicle enqueued to outbox. The on-site relay script will pick it up on the next poll.'
          : 'Test vehicle sent successfully. Check Videofit Database list to confirm receipt.';
      return NextResponse.json({
        success: true,
        message,
        plate: 'TEST123',
        group: defaultGroup,
        mode,
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
