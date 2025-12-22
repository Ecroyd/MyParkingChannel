// GET /api/internal/anpr/staff-vehicles - Get staff vehicles for a tenant
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
      console.error('[ANPR Staff Vehicles] Error decrypting relay token:', error);
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

    // Fetch active staff vehicles for this tenant
    const { data: vehicles, error: fetchError } = await supabase
      .from('staff_vehicles')
      .select('plate, description')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('plate', { ascending: true });

    if (fetchError) {
      console.error('[ANPR Staff Vehicles] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch staff vehicles' },
        { status: 500 }
      );
    }

    // Format response
    const formattedVehicles = (vehicles || []).map((vehicle) => ({
      plate: vehicle.plate,
      description: vehicle.description || null,
    }));

    return NextResponse.json({
      ok: true,
      vehicles: formattedVehicles,
      count: formattedVehicles.length,
    });
  } catch (error: any) {
    console.error('[ANPR Staff Vehicles] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

