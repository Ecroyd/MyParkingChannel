// GET /api/internal/anpr/videofit/diagnostics - Get Videofit diagnostics from relay
// Authenticated via Bearer token (tenant relay token from tenant_secrets)
// This endpoint is called by the relay script to report diagnostic information

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
      console.error('[ANPR Diagnostics] Error decrypting relay token:', error);
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

    // Get the most recent diagnostics from integration_events
    const { data: recentDiagnostics, error: diagnosticsError } = await supabase
      .from('integration_events')
      .select('payload, created_at')
      .eq('tenant_id', tenantId)
      .eq('event_type', 'videofit.diagnostics')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (diagnosticsError && diagnosticsError.code !== 'PGRST116') {
      console.error('[ANPR Diagnostics] Error fetching diagnostics:', diagnosticsError);
      return NextResponse.json(
        { error: 'Failed to fetch diagnostics' },
        { status: 500 }
      );
    }

    if (!recentDiagnostics || !recentDiagnostics.payload) {
      return NextResponse.json({
        ok: true,
        diagnostics: null,
        message: 'No diagnostics available. The relay script should collect and POST diagnostics to this endpoint.',
      });
    }

    // Return the most recent diagnostics
    return NextResponse.json({
      ok: true,
      diagnostics: {
        videofitProcess: recentDiagnostics.payload.videofitProcess,
        iisEndpoints: recentDiagnostics.payload.iisEndpoints,
        recentFiles: recentDiagnostics.payload.recentFiles,
        collectedAt: recentDiagnostics.created_at,
      },
    });
  } catch (error: any) {
    console.error('[ANPR Diagnostics] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
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
      console.error('[ANPR Diagnostics] Error decrypting relay token:', error);
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

    // Parse diagnostic data from relay script
    const body = await req.json();
    const {
      videofitProcess,
      iisEndpoints,
      recentFiles,
      collectedAt,
    } = body;

    // Store diagnostics in integration_events for audit trail
    const idempotencyKey = `videofit_diagnostics_${tenantId}_${Date.now()}`;
    const payloadHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(body))
      .digest('hex');

    await supabase.from('integration_events').insert({
      tenant_id: tenantId,
      direction: 'inbound',
      event_type: 'videofit.diagnostics',
      idempotency_key: idempotencyKey,
      payload_hash: payloadHash,
      status: 'success',
      payload: body,
    });

    // Return the diagnostic data (for UI display)
    return NextResponse.json({
      ok: true,
      diagnostics: {
        videofitProcess,
        iisEndpoints,
        recentFiles,
        collectedAt,
      },
    });
  } catch (error: any) {
    console.error('[ANPR Diagnostics] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

