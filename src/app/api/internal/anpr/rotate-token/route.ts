// POST /api/internal/anpr/rotate-token - Rotate relay token for a tenant
// Auth: Normal logged-in tenant admin (not relay token)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { createHash } from 'crypto';
import { randomBytes } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // Verify user has admin access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!userTenant || (userTenant.role !== 'admin' && userTenant.role !== 'owner')) {
      return NextResponse.json(
        { error: 'Access denied. Admin role required.' },
        { status: 403 }
      );
    }

    // Generate new 32-byte token (64 hex chars)
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    // Upsert anpr_sites with new token hash
    const { data: site, error: upsertError } = await adminClient
      .from('anpr_sites')
      .upsert(
        {
          tenant_id: tenantId,
          relay_token_hash: tokenHash,
          enabled: true, // Default to enabled when creating
        },
        {
          onConflict: 'tenant_id',
        }
      )
      .select()
      .single();

    if (upsertError) {
      console.error('Error rotating token:', upsertError);
      return NextResponse.json(
        { error: 'Failed to rotate token' },
        { status: 500 }
      );
    }

    // Return raw token ONCE - never stored anywhere
    return NextResponse.json({
      success: true,
      relayToken: rawToken,
    });
  } catch (error: any) {
    console.error('POST /api/internal/anpr/rotate-token error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

