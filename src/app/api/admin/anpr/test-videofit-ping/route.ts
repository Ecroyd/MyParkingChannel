// Test Videofit connectivity using Ping method
// POST /api/admin/anpr/test-videofit-ping?tenantId=...

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { pingVideofit } from '@/lib/videofit/ping';

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

    // Get Videofit base URL from tenant_secrets (column-based storage)
    const { data: secret } = await adminClient
      .from('tenant_secrets')
      .select('videofit_base_url')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!secret?.videofit_base_url) {
      return NextResponse.json(
        { error: 'Videofit not configured. Please set Videofit Base URL in ANPR settings.' },
        { status: 400 }
      );
    }

    const baseUrl = secret.videofit_base_url;

    // Ping Videofit
    const result = await pingVideofit(baseUrl);

    // Log integration event
    const idempotencyKey = `videofit_ping_${tenantId}_${Date.now()}`;
    await adminClient.from('integration_events').insert({
      tenant_id: tenantId,
      direction: 'outbound',
      event_type: 'videofit_ping',
      idempotency_key: idempotencyKey,
      status: result.success ? 'success' : 'failed',
      http_status: result.statusCode || null,
      duration_ms: result.durationMs || null,
      payload: { baseUrl },
      response: result.response || null,
      error: result.error || null,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'ANPR connection successful. Network and endpoint are reachable.',
        durationMs: result.durationMs,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Ping failed',
          statusCode: result.statusCode,
          response: result.response,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Videofit ping test error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
