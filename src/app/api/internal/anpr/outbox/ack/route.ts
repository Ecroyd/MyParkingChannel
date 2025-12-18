// POST /api/internal/anpr/outbox/ack - Acknowledge processed items
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

export async function POST(req: NextRequest) {
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
      console.error('[ANPR Outbox ACK] Error decrypting relay token:', error);
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
