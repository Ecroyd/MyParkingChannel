// POST /api/internal/anpr/outbox/ack - Acknowledge processed items
// Authenticated via per-tenant relay token (x-relay-token header or Bearer)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRelayAuth } from '../../_relayAuth';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    // Get tenantId from query params
    const tenantId = req.nextUrl.searchParams.get('tenantId') ?? '';

    const auth = await requireRelayAuth(req, tenantId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const supabase = supabaseAdmin();

    // Parse request body
    const body = await req.json();
    const { itemIds, success } = body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json(
        { error: 'itemIds must be a non-empty array' },
        { status: 400 }
      );
    }

    if (typeof success !== 'boolean') {
      return NextResponse.json(
        { error: 'success must be a boolean' },
        { status: 400 }
      );
    }

    // Verify all items belong to this tenant and are pending/processing
    const { data: items, error: verifyError } = await supabase
      .from('anpr_outbox')
      .select('id, tenant_id, status')
      .in('id', itemIds)
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'processing']);

    if (verifyError) {
      console.error('[ANPR Outbox ACK] Verify error:', verifyError);
      return NextResponse.json(
        { error: 'Failed to verify items' },
        { status: 500 }
      );
    }

    if (!items || items.length !== itemIds.length) {
      return Response.json(
        { error: 'Some items not found or not in pending/processing status' },
        { status: 400 }
      );
    }

    const verifiedIds = items.map((item) => item.id);
    const now = new Date().toISOString();

    // Only ack if success === true
    // If SOAP fails on the PC, the relay should not call ack, so this route should not clear anything on failure
    if (!success) {
      return Response.json({
        success: false,
        message: 'Items not acknowledged (success=false). Items remain in outbox for retry.',
      });
    }

    // Mark items as processed (only if still pending/processing)
    const { error: updateError } = await supabase
      .from('anpr_outbox')
      .update({
        processed_at: now,
      })
      .in('id', verifiedIds)
      .in('status', ['pending', 'processing']);

    if (updateError) {
      console.error('[ANPR Outbox ACK] Update error:', updateError);
      return Response.json(
        { error: 'Failed to acknowledge items. They may have already been processed.' },
        { status: 400 }
      );
    }

    return Response.json({
      ok: true,
      acknowledged: verifiedIds.length,
      message: 'Items acknowledged',
    });
  } catch (error: any) {
    console.error('[ANPR Outbox ACK] Error:', error);
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
