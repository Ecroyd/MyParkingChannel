// POST /api/admin/anpr-sites/generate-token - Generate new relay token

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { hashRelayToken, generateRelayToken } from '@/lib/anpr/relayAuth';

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
      return NextResponse.json({ error: 'Access denied. Admin role required.' }, { status: 403 });
    }

    // Check if site exists
    const { data: existing } = await adminClient
      .from('anpr_sites')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: 'ANPR site not found. Please create the site first.' },
        { status: 404 }
      );
    }

    // Generate new token
    const newToken = generateRelayToken();
    const tokenHash = hashRelayToken(newToken);

    // Update the hash
    const { error: updateError } = await adminClient
      .from('anpr_sites')
      .update({ relay_token_hash: tokenHash })
      .eq('id', existing.id);

    if (updateError) {
      console.error('Error updating relay token:', updateError);
      return NextResponse.json(
        { error: 'Failed to generate new token' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      relayToken: newToken, // Return once, never stored
    });
  } catch (error: any) {
    console.error('POST /api/admin/anpr-sites/generate-token error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

