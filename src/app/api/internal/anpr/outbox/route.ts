// GET /api/internal/anpr/outbox - Poll pending vehicle updates (NON-DESTRUCTIVE)
// Authenticated via per-tenant relay token (x-relay-token header or Bearer)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { assertRelayAuth } from '@/lib/anpr/auth';

/**
 * Quick auth helper for specific tenant with hardcoded token
 */
function checkRelayAuth(req: NextRequest, tenantId: string): Response | null {
  // Special case for tenant bab45dab-19e8-4230-b18e-ee1f663608e5
  if (tenantId === 'bab45dab-19e8-4230-b18e-ee1f663608e5') {
    // Read token from multiple sources
    let token: string | null = req.headers.get('x-relay-token');
    
    if (!token) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }
    
    if (!token) {
      const { searchParams } = new URL(req.url);
      token = searchParams.get('token');
    }
    
    if (!token) {
      return NextResponse.json(
        { error: 'Invalid or missing relay token' },
        { status: 401 }
      );
    }
    
    const expectedToken = process.env.ANPR_RELAY_TOKEN_BAB45DAB;
    if (!expectedToken || token !== expectedToken) {
      return NextResponse.json(
        { error: 'Invalid or missing relay token' },
        { status: 401 }
      );
    }
    
    return null; // Auth successful
  }
  
  return null; // Not the special tenant, use normal auth
}

export async function GET(req: NextRequest) {
  try {
    // Get tenantId from query params
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId query parameter is required' },
        { status: 400 }
      );
    }

    // Check quick auth first (for specific tenant)
    const quickAuthError = checkRelayAuth(req, tenantId);
    if (quickAuthError) {
      return quickAuthError;
    }

    // Authenticate using per-tenant relay token (for other tenants)
    try {
      await assertRelayAuth(req, tenantId);
    } catch (authError) {
      // assertRelayAuth throws a Response object on failure
      return authError as Response;
    }

    const supabase = createAdminClient();

    // Get query parameters
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 1000); // Max 1000 items
    const maxAge = parseInt(searchParams.get('maxAge') || '86400', 10); // Default 24 hours in seconds

    // Calculate cutoff time (only return items created within maxAge)
    const cutoffTime = new Date(Date.now() - maxAge * 1000).toISOString();

    // IMPORTANT: NON-DESTRUCTIVE - Just fetch pending items, don't mark as processing
    // The relay will ACK items after successful SOAP processing
    const { data: items, error: fetchError } = await supabase
      .from('anpr_outbox')
      .select('id, plate, group_number, valid_from, valid_until, action, created_at, retry_count, type, reason')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (fetchError) {
      console.error('[ANPR Outbox] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch outbox items' },
        { status: 500 }
      );
    }

    // Format response
    const formattedItems = (items || []).map((item: any) => ({
      id: item.id,
      plate: item.plate,
      group: item.group_number,
      validFrom: item.valid_from,
      validUntil: item.valid_until,
      action: item.action,
      createdAt: item.created_at,
      retryCount: item.retry_count,
      type: item.type || null,
      reason: item.reason || null,
    }));

    return NextResponse.json({
      ok: true,
      items: formattedItems,
      count: formattedItems.length,
    });
  } catch (error: any) {
    console.error('[ANPR Outbox] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
