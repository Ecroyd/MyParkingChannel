// GET /api/admin/anpr/cameras - Get recent camera IDs from anpr_events

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const limit = parseInt(searchParams.get('limit') || '100', 10);

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

    // Fetch recent camera IDs from anpr_events
    const { data: events, error: eventsError } = await adminClient
      .from('anpr_events')
      .select('camera_id')
      .eq('tenant_id', tenantId)
      .not('camera_id', 'is', null)
      .order('event_at', { ascending: false })
      .limit(limit);

    if (eventsError) {
      console.error('Error fetching camera IDs:', eventsError);
      return NextResponse.json(
        { error: 'Failed to fetch camera IDs' },
        { status: 500 }
      );
    }

    // Extract unique camera IDs
    const cameraIds = Array.from(
      new Set(
        (events || [])
          .map((e) => e.camera_id)
          .filter((id): id is string => id !== null && id !== undefined)
      )
    ).sort();

    return NextResponse.json({ cameras: cameraIds });
  } catch (error: any) {
    console.error('Camera IDs API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
