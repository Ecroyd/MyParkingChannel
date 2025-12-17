// POST /api/admin/anpr/generate-csv-token
// Generate a new CSV export token for tenant

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/server';
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

    // Generate new token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // Update or create config with token hash
    const { error: configError } = await adminClient
      .from('tenant_anpr_config')
      .upsert({
        tenant_id: tenantId,
        csv_token_hash: tokenHash,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_id',
      });

    if (configError) {
      console.error('Error updating CSV token:', configError);
      return NextResponse.json(
        { error: 'Failed to generate CSV token' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      rawToken,
      message: 'Copy this CSV token now. It will not be shown again after you leave this page.',
    });
  } catch (error: any) {
    console.error('Generate CSV token error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
