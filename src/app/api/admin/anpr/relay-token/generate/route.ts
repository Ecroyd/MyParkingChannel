// POST /api/admin/anpr/relay-token/generate - Generate or rotate ANPR relay token
// Auth: owner/admin only

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { randomBytes, createHash } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Simple encryption helper (matches pattern from APH integration)
 * TODO: Implement proper encryption using ENCRYPTION_KEY
 */
function encryptSecret(value: string): string {
  return Buffer.from(value).toString('base64');
}

/**
 * Simple decryption helper (matches pattern from APH integration)
 * TODO: Implement proper decryption using ENCRYPTION_KEY
 */
function decryptSecret(encryptedValue: string): string {
  return Buffer.from(encryptedValue, 'base64').toString();
}

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

    // Verify user has owner/admin access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!userTenant || (userTenant.role !== 'admin' && userTenant.role !== 'owner')) {
      return NextResponse.json(
        { error: 'Access denied. Owner or admin role required.' },
        { status: 403 }
      );
    }

    // Generate strong token (64 hex chars = 32 bytes)
    const token = randomBytes(32).toString('hex');

    // Use encrypted key-value pattern (like APH SFTP credentials)
    // ALWAYS save as: scope='anpr', key='anpr_relay_token', value_ciphertext=encrypted
    const encrypted = encryptSecret(token);

    const { error: upsertError } = await adminClient
      .from('tenant_secrets')
      .upsert(
        {
          tenant_id: tenantId,
          scope: 'anpr',
          key: 'anpr_relay_token',
          value_ciphertext: encrypted,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,scope,key' }
      );

    if (upsertError) {
      console.error('[ANPR Relay Token] Failed to save token:', upsertError);
      return NextResponse.json(
        { error: 'Failed to save relay token', details: upsertError.message },
        { status: 500 }
      );
    }

    // Log audit event (without storing the token)
    const idempotencyKey = `anpr_relay_token_rotate_${tenantId}_${Date.now()}`;
    const auditPayload = {
      action: 'rotate',
      tenant_id: tenantId,
    };
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(auditPayload))
      .digest('hex');

    await adminClient.from('integration_events').insert({
      tenant_id: tenantId,
      direction: 'internal',
      event_type: 'anpr.relay_token.rotate',
      idempotency_key: idempotencyKey,
      payload_hash: payloadHash,
      status: 'success',
      payload: auditPayload,
    });

    return NextResponse.json(
      {
        ok: true,
        token,
        rotatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error: any) {
    console.error('[ANPR Relay Token] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
