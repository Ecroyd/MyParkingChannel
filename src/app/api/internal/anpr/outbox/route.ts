// GET /api/internal/anpr/outbox - Poll pending vehicle updates
// Authenticated via Bearer token (tenant relay token from tenant_secrets)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import crypto from 'crypto';

/**
 * Simple decryption helper (matches pattern from other integrations)
 * TODO: Implement proper decryption using ENCRYPTION_KEY
 */
function decryptSecret(encryptedValue: string): string {
  return Buffer.from(encryptedValue, 'base64').toString();
}

/**
 * Timing-safe comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
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

    // Authenticate via Bearer token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header. Expected: Bearer <token>' },
        { status: 401 }
      );
    }

    const providedToken = authHeader.substring(7); // Remove "Bearer " prefix
    const supabase = createAdminClient();

    // Fetch relay token from tenant_secrets
    const { data: secret, error: secretError } = await supabase
      .from('tenant_secrets')
      .select('value_ciphertext')
      .eq('tenant_id', tenantId)
      .eq('scope', 'anpr')
      .eq('key', 'anpr_relay_token')
      .maybeSingle();

    if (secretError || !secret || !secret.value_ciphertext) {
      return NextResponse.json(
        { error: 'Invalid relay token' },
        { status: 401 }
      );
    }

    // Decrypt the stored token
    let storedToken: string;
    try {
      storedToken = decryptSecret(secret.value_ciphertext);
    } catch (error) {
      console.error('[ANPR Outbox] Error decrypting relay token:', error);
      return NextResponse.json(
        { error: 'Invalid relay token' },
        { status: 401 }
      );
    }

    // Timing-safe comparison
    if (!timingSafeEqual(providedToken, storedToken)) {
      return NextResponse.json(
        { error: 'Invalid relay token' },
        { status: 401 }
      );
    }

    // Get query parameters (reuse searchParams from above)
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
