// POST /api/internal/anpr/ack - Acknowledge processed outbox item
// Authenticated via x-relay-token header

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { authenticateRelayRequest } from '@/lib/anpr/relayAuth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, outboxItemId } = body;

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId is required' },
        { status: 400 }
      );
    }

    if (!outboxItemId) {
      return NextResponse.json(
        { error: 'outboxItemId is required' },
        { status: 400 }
      );
    }

    // Authenticate via x-relay-token header
    const relayToken = req.headers.get('x-relay-token');
    const site = await authenticateRelayRequest(tenantId, relayToken);

    if (!site) {
      return NextResponse.json(
        { error: 'Invalid or missing relay token' },
        { status: 401 }
      );
    }

    if (!site.enabled) {
      return NextResponse.json(
        { error: 'ANPR site is not enabled' },
        { status: 403 }
      );
    }

    const supabase = createAdminClient();

    // Mark item as processed (only if still pending/processing)
    const { data: item, error: updateError } = await supabase
      .from('anpr_outbox')
      .update({ status: 'processed' })
      .eq('id', outboxItemId)
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'processing']) // Only update if still pending/processing
      .select()
      .single();

    if (updateError) {
      console.error('[ANPR ACK] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to acknowledge item. It may have already been processed.' },
        { status: 400 }
      );
    }

    if (!item) {
      return NextResponse.json(
        { error: 'Item not found or already processed' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Item acknowledged',
    });
  } catch (error: any) {
    console.error('[ANPR ACK] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

