// POST /api/admin/anpr/test-csv-url
// Test the hosted CSV URL with the provided token

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, token } = body;

    if (!tenantId || !token) {
      return NextResponse.json(
        { error: 'tenantId and token are required' },
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

    // Get tenant context
    const ctx = await getCurrentTenantContext();
    if (!ctx) {
      return NextResponse.json({ error: 'No tenant context' }, { status: 403 });
    }

    // Verify user has admin access to this tenant
    if (ctx.role !== 'admin' && ctx.role !== 'owner') {
      return NextResponse.json({ error: 'Access denied. Admin role required.' }, { status: 403 });
    }

    // Verify tenant matches context
    if (ctx.tenantId !== tenantId) {
      return NextResponse.json({ error: 'Tenant mismatch' }, { status: 403 });
    }

    // Get the base URL from request
    const protocol = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host') || req.headers.get('x-forwarded-host');
    const baseUrl = `${protocol}://${host}`;

    // Test the hosted CSV endpoint
    const testUrl = `${baseUrl}/api/integrations/anpr/known-vehicles.csv?tenant=${tenantId}&token=${encodeURIComponent(token)}`;

    try {
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'ParkingChannel-Admin-Test/1.0',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json({
          success: false,
          status: response.status,
          error: errorText,
        });
      }

      const csv = await response.text();
      const lines = csv.split('\n').filter((line) => line.trim());

      return NextResponse.json({
        success: true,
        status: response.status,
        rowCount: Math.max(0, lines.length - 1), // Subtract header
        preview: lines.slice(0, 3).join('\n'), // First 3 lines (header + 2 rows)
      });
    } catch (fetchError: any) {
      return NextResponse.json({
        success: false,
        error: fetchError.message || 'Failed to test URL',
      });
    }
  } catch (error: any) {
    console.error('Test CSV URL error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
