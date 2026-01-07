// GET /api/admin/anpr/videofit/diagnostics - Get Videofit diagnostics (admin access)
// This endpoint is called by the admin UI to retrieve diagnostics collected by the relay script

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';

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

    // Get the most recent diagnostics from integration_events
    const { data: recentDiagnostics, error: diagnosticsError } = await adminClient
      .from('integration_events')
      .select('payload, created_at')
      .eq('tenant_id', tenantId)
      .eq('event_type', 'videofit.diagnostics')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (diagnosticsError && diagnosticsError.code !== 'PGRST116') {
      console.error('[ANPR Diagnostics] Error fetching diagnostics:', diagnosticsError);
      return NextResponse.json(
        { error: 'Failed to fetch diagnostics' },
        { status: 500 }
      );
    }

    if (!recentDiagnostics || !recentDiagnostics.payload) {
      return NextResponse.json({
        ok: true,
        diagnostics: null,
        message: 'No diagnostics available. The relay script should collect and POST diagnostics to /api/internal/anpr/videofit/diagnostics',
      });
    }

    // Return the most recent diagnostics
    return NextResponse.json({
      ok: true,
      diagnostics: {
        videofitProcess: recentDiagnostics.payload.videofitProcess,
        iisEndpoints: recentDiagnostics.payload.iisEndpoints,
        recentFiles: recentDiagnostics.payload.recentFiles,
        collectedAt: recentDiagnostics.created_at,
      },
    });
  } catch (error: any) {
    console.error('[ANPR Diagnostics] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

