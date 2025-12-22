// POST /api/internal/anpr/ack - Acknowledge processed outbox item
// Authenticated via per-tenant relay token
// Only acks items if body.success === true

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, outboxItemId, success } = body;

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

    if (typeof success !== 'boolean') {
      return NextResponse.json(
        { error: 'success must be a boolean' },
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

    // Only ack if success === true
    // If SOAP fails on the PC, the relay should not call ack, so this route should not clear anything on failure
    if (!success) {
      return NextResponse.json({
        success: false,
        message: 'Item not acknowledged (success=false). Item remains in outbox for retry.',
      });
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
