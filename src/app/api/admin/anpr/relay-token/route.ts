// GET /api/admin/anpr/relay-token - Get ANPR relay token
// Auth: owner/admin only

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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

    // Fetch token from tenant_secrets - try column-based first, then key-value
    let token: string | null = null;
    let rotatedAt: string | null = null;

    // Try column-based approach
    const { data: columnSecret, error: columnError } = await adminClient
      .from('tenant_secrets')
      .select('anpr_relay_token, updated_at')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!columnError && columnSecret) {
      token = columnSecret.anpr_relay_token || null;
      rotatedAt = columnSecret.updated_at || null;
    } else {
      // Try key-value approach
      const { data: kvSecret, error: kvError } = await adminClient
        .from('tenant_secrets')
        .select('value, updated_at')
        .eq('tenant_id', tenantId)
        .eq('key', 'anpr_relay_token')
        .maybeSingle();

      if (kvError && kvError.code !== 'PGRST116') {
        // PGRST116 = not found, which is okay
        console.error('[ANPR Relay Token] Error fetching token:', kvError);
        return NextResponse.json(
          { error: 'Failed to fetch relay token' },
          { status: 500 }
        );
      }

      if (kvSecret) {
        token = kvSecret.value || null;
        rotatedAt = kvSecret.updated_at || null;
      }
    }

    return NextResponse.json(
      {
        ok: true,
        token,
        rotatedAt,
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
