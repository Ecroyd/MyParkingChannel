// GET /api/admin/anpr/relay-token - Get ANPR relay token
// Auth: owner/admin only

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Simple decryption helper (matches pattern from APH integration)
 * TODO: Implement proper decryption using ENCRYPTION_KEY
 */
function decryptSecret(encryptedValue: string): string {
  return Buffer.from(encryptedValue, 'base64').toString();
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

    // Fetch token from tenant_secrets using encrypted key-value pattern
    const { data: secret, error: secretError } = await adminClient
      .from('tenant_secrets')
      .select('value_ciphertext, updated_at')
      .eq('tenant_id', tenantId)
      .eq('scope', 'anpr_relay')
      .eq('key', 'RELAY_TOKEN')
      .maybeSingle();

    if (secretError && secretError.code !== 'PGRST116') {
      // PGRST116 = not found, which is okay
      console.error('[ANPR Relay Token] Error fetching token:', secretError);
      return NextResponse.json(
        { error: 'Failed to fetch relay token' },
        { status: 500 }
      );
    }

    let token: string | null = null;
    if (secret?.value_ciphertext) {
      try {
        token = decryptSecret(secret.value_ciphertext);
      } catch (error) {
        console.error('[ANPR Relay Token] Error decrypting token:', error);
        return NextResponse.json(
          { error: 'Failed to decrypt relay token' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        token,
        rotatedAt: secret?.updated_at || null,
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
