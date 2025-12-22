// POST /api/internal/anpr/ack - Acknowledge processed outbox item
// Authenticated via per-tenant relay token
// Only acks items if body.success === true

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRelayAuth } from '../_relayAuth';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, outboxItemId, success } = body;

    const auth = await requireRelayAuth(req, tenantId ?? "");
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    if (!outboxItemId) {
      return NextResponse.json(
        { error: 'outboxItemId is required' },
        { status: 400 }
      );
    }

    if (typeof success !== 'boolean') {
      return NextResponse.json(
        { error: 'success must be a boolean' },
        { status: 400 }
      );
    }

    // Only ack if success === true
    // If SOAP fails on the PC, the relay should not call ack, so this route should not clear anything on failure
    if (!success) {
      return NextResponse.json({
        success: false,
        message: 'Item not acknowledged (success=false). Item remains in outbox for retry.',
      });
    }

    const admin = supabaseAdmin();

    // Mark item as processed (only if still pending/processing)
    const { data: item, error: updateError } = await admin
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
