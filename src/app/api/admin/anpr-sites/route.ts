// GET /api/admin/anpr-sites - Get ANPR site config for tenant
// POST /api/admin/anpr-sites - Create or update ANPR site config
// PUT /api/admin/anpr-sites/generate-token - Generate new relay token

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { hashRelayToken, generateRelayToken } from '@/lib/anpr/relayAuth';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get tenantId from query params
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

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

    // Fetch anpr_site
    const { data: site, error: fetchError } = await adminClient
      .from('anpr_sites')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching anpr_site:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch ANPR site config' },
        { status: 500 }
      );
    }

    // Don't return the hash
    if (site) {
      const { relay_token_hash, ...siteWithoutHash } = site;
      return NextResponse.json({ success: true, data: siteWithoutHash });
    }

    return NextResponse.json({ success: true, data: null });
  } catch (error: any) {
    console.error('GET /api/admin/anpr-sites error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

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
    const {
      tenantId,
      name,
      enabled,
      locPcNo,
      siteClientLicense,
      defaultGroup,
      includeUpcomingHours,
      graceAfterEndHours,
      minSnapshotPlates,
      allowSmallSnapshotManual,
    } = body;

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

    // Generate relay token if creating new site
    let relayTokenHash: string;
    let newRelayToken: string | null = null;

    if (!existing) {
      // New site - generate token
      newRelayToken = generateRelayToken();
      relayTokenHash = hashRelayToken(newRelayToken);
    } else {
      // Existing site - keep current hash
      const { data: currentSite } = await adminClient
        .from('anpr_sites')
        .select('relay_token_hash')
        .eq('id', existing.id)
        .single();
      relayTokenHash = currentSite?.relay_token_hash || '';
    }

    // Upsert site config
    const siteData: any = {
      tenant_id: tenantId,
      relay_token_hash: relayTokenHash,
    };

    if (name !== undefined) siteData.name = name;
    if (enabled !== undefined) siteData.enabled = enabled;
    if (locPcNo !== undefined) siteData.loc_pc_no = locPcNo;
    if (siteClientLicense !== undefined) siteData.site_client_license = siteClientLicense;
    if (defaultGroup !== undefined) siteData.default_group = defaultGroup;
    if (includeUpcomingHours !== undefined) siteData.include_upcoming_hours = includeUpcomingHours;
    if (graceAfterEndHours !== undefined) siteData.grace_after_end_hours = graceAfterEndHours;
    if (minSnapshotPlates !== undefined) siteData.min_snapshot_plates = minSnapshotPlates;
    if (allowSmallSnapshotManual !== undefined) siteData.allow_small_snapshot_manual = allowSmallSnapshotManual;

    const { data: site, error: upsertError } = await adminClient
      .from('anpr_sites')
      .upsert(siteData, {
        onConflict: 'tenant_id',
      })
      .select()
      .single();

    if (upsertError) {
      console.error('Error upserting anpr_site:', upsertError);
      return NextResponse.json(
        { error: 'Failed to save ANPR site config' },
        { status: 500 }
      );
    }

    const { relay_token_hash, ...siteWithoutHash } = site;

    return NextResponse.json({
      success: true,
      data: siteWithoutHash,
      relayToken: newRelayToken, // Only returned when creating new site
    });
  } catch (error: any) {
    console.error('POST /api/admin/anpr-sites error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

