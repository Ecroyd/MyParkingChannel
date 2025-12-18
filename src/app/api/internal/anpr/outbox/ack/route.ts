// POST /api/internal/anpr/outbox/ack - Acknowledge processed items
// Authenticated via Bearer token (gate device API key)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { hashGateDeviceKey } from '@/lib/devices/gateDeviceKeys';

export async function POST(req: NextRequest) {
  try {
    // Authenticate via Bearer token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header. Expected: Bearer <token>' },
        { status: 401 }
      );
    }

    const deviceToken = authHeader.substring(7); // Remove "Bearer " prefix
    const apiKeyHash = hashGateDeviceKey(deviceToken);
    const supabase = createAdminClient();

    // Find device by hashed key
    const { data: device, error: deviceError } = await supabase
      .from('gate_devices')
      .select('id, tenant_id, status, kind, name')
      .eq('api_key_hash', apiKeyHash)
      .maybeSingle();

    if (deviceError || !device) {
      return NextResponse.json(
        { error: 'Invalid device token' },
        { status: 401 }
      );
    }

    if (device.status !== 'active') {
      return NextResponse.json(
        { error: 'Device not active' },
        { status: 403 }
      );
    }

    const tenantId = device.tenant_id;

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

    // Verify all items belong to this tenant and are in processing status
    const { data: items, error: verifyError } = await supabase
      .from('anpr_outbox')
      .select('id, tenant_id, status')
      .in('id', itemIds)
      .eq('tenant_id', tenantId)
      .eq('status', 'processing');

    if (verifyError) {
      console.error('[ANPR Outbox ACK] Verify error:', verifyError);
      return NextResponse.json(
        { error: 'Failed to verify items' },
        { status: 500 }
      );
    }

    if (!items || items.length !== itemIds.length) {
      return NextResponse.json(
        { error: 'Some items not found or not in processing status' },
        { status: 400 }
      );
    }

    const verifiedIds = items.map((item) => item.id);
    const now = new Date().toISOString();

    // Update items based on success/failure
    if (success) {
      // Mark as completed
      const { error: updateError } = await supabase
        .from('anpr_outbox')
        .update({
          status: 'completed',
          processed_at: now,
        })
        .in('id', verifiedIds)
        .eq('status', 'processing');

      if (updateError) {
        console.error('[ANPR Outbox ACK] Update error:', updateError);
        return NextResponse.json(
          { error: 'Failed to acknowledge items' },
          { status: 500 }
        );
      }
    } else {
      // Mark as failed and increment retry count
      // First fetch current retry counts
      const { data: currentItems } = await supabase
        .from('anpr_outbox')
        .select('id, retry_count')
        .in('id', verifiedIds)
        .eq('status', 'processing');

      if (currentItems) {
        // Update each item with incremented retry count
        for (const item of currentItems) {
          await supabase
            .from('anpr_outbox')
            .update({
              status: 'failed',
              processed_at: now,
              retry_count: (item.retry_count || 0) + 1,
            })
            .eq('id', item.id)
            .eq('status', 'processing');
        }

        // Reset failed items back to pending for retry (if retry_count < max)
        // This allows automatic retry of transient failures
        const maxRetries = 3;
        const retryableIds = currentItems
          .filter((item) => (item.retry_count || 0) + 1 < maxRetries)
          .map((item) => item.id);

        if (retryableIds.length > 0) {
          await supabase
            .from('anpr_outbox')
            .update({ status: 'pending' })
            .in('id', retryableIds)
            .eq('status', 'failed');
        }
      }
    }

    return NextResponse.json({
      ok: true,
      acknowledged: verifiedIds.length,
      status: success ? 'completed' : 'failed',
    });
  } catch (error: any) {
    console.error('[ANPR Outbox ACK] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
