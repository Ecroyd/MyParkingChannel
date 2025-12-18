// GET /api/internal/anpr/outbox - Poll pending vehicle updates
// Authenticated via Bearer token (gate device API key)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { hashGateDeviceKey } from '@/lib/devices/gateDeviceKeys';

export async function GET(req: NextRequest) {
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

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 1000); // Max 1000 items
    const maxAge = parseInt(searchParams.get('maxAge') || '86400', 10); // Default 24 hours in seconds

    // Calculate cutoff time (only return items created within maxAge)
    const cutoffTime = new Date(Date.now() - maxAge * 1000).toISOString();

    // Fetch pending items for this tenant, ordered by created_at
    const { data: items, error: fetchError } = await supabase
      .from('anpr_outbox')
      .select('id, plate, group_number, valid_from, valid_until, action, created_at, retry_count')
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

    // Mark items as processing (atomic update)
    if (items && items.length > 0) {
      const itemIds = items.map((item) => item.id);
      const { error: updateError } = await supabase
        .from('anpr_outbox')
        .update({ status: 'processing' })
        .in('id', itemIds)
        .eq('status', 'pending'); // Only update if still pending (prevents race conditions)

      if (updateError) {
        console.error('[ANPR Outbox] Update to processing error:', updateError);
        // Continue anyway - return items but they may be processed by another poller
      }
    }

    // Format response
    const formattedItems = (items || []).map((item) => ({
      id: item.id,
      plate: item.plate,
      group: item.group_number,
      validFrom: item.valid_from,
      validUntil: item.valid_until,
      action: item.action,
      createdAt: item.created_at,
      retryCount: item.retry_count,
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
