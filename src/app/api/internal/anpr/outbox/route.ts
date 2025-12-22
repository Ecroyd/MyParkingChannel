// GET /api/internal/anpr/outbox - Poll pending vehicle updates (NON-DESTRUCTIVE)
// Authenticated via per-tenant relay token (x-relay-token header or Bearer)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { assertRelayAuth } from '@/lib/anpr/auth';

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

    // Authenticate using per-tenant relay token
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
