// GET /api/internal/anpr/outbox - Poll pending vehicle updates (NON-DESTRUCTIVE)
// Authenticated via per-tenant relay token (x-relay-token header or Bearer)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRelayTokenForTenant } from '../_relayAuth';

export async function GET(req: NextRequest) {
  try {
    // Get tenantId from query params
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenantId') || '';

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId query parameter is required' },
        { status: 400 }
      );
    }

    const authResp = requireRelayTokenForTenant(req, tenantId);
    if (authResp) return authResp;

    // Use Supabase SERVICE ROLE (server-side), not cookie/session auth
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[ANPR Outbox] Missing env vars:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey,
      });
      return NextResponse.json(
        { error: 'Server configuration error', details: 'Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    // Get query parameters
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 200); // Max 200 items
    const maxAge = parseInt(url.searchParams.get('maxAge') || '86400', 10); // Default 24 hours in seconds

    // Calculate cutoff time (only return items created within maxAge)
    const cutoffTime = new Date(Date.now() - maxAge * 1000).toISOString();

    console.log('[ANPR Outbox] Querying outbox:', {
      tenantId,
      limit,
      maxAge,
      cutoffTime,
    });

    // IMPORTANT: NON-DESTRUCTIVE - Just fetch pending items, don't mark as processing
    // The relay will ACK items after successful SOAP processing
    // Query with: tenant_id match, status='pending' (or processed_at IS NULL), order by created_at, limit
    const { data: items, error: fetchError } = await supabaseAdmin
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
        { error: 'Failed to fetch outbox items', details: fetchError?.message ?? String(fetchError) },
        { status: 500 }
      );
    }

    console.log('[ANPR Outbox] Query successful:', {
      itemCount: items?.length || 0,
    });

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
    console.error('[ANPR Outbox] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
