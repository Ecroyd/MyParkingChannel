// POST /api/admin/anpr/videofit/generate-token
// Generate a new Videofit ingest token for a tenant

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId } = body;

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId is required' },
        { status: 400 }
      );
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

    // Generate a random token (32 bytes = 64 hex characters)
    const rawToken = randomBytes(32).toString('hex');

    // Hash the token using SHA256
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    // Update tenant_anpr_config with the new token hash
    const { error: updateError } = await adminClient
      .from('tenant_anpr_config')
      .upsert({
        tenant_id: tenantId,
        videofit_ingest_token_hash: tokenHash,
      }, {
        onConflict: 'tenant_id',
      });

    if (updateError) {
      console.error('[Videofit Token] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to save token' },
        { status: 500 }
      );
    }

    // Return the raw token ONCE (never store it)
    return NextResponse.json({
      success: true,
      relayToken: rawToken, // Return as relayToken for consistency with other endpoints
      message: 'Token generated successfully. Copy it now - it will not be shown again!',
    });
  } catch (error: any) {
    console.error('[Videofit Token] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
