// GET /api/internal/anpr/outbox - Poll pending vehicle updates (NON-DESTRUCTIVE)
// Authenticated via per-tenant relay token (x-relay-token header or Bearer)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRelayTokenForTenant } from '../_relayAuth';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  try {
    // Get tenantId from query params
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenantId') || '';

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId query parameter is required' },
        { status: 400 }
      );
    }

    const authResp = requireRelayTokenForTenant(req, tenantId);
    if (authResp) return authResp;

    const admin = supabaseAdmin();

    // IMPORTANT: replace table/fields below if your schema differs.
    // Start by trying "anpr_outbox" (most likely), then adjust if error says table missing.
    const { data, error } = await admin
      .from("anpr_outbox")
      .select("*")
      .eq("tenant_id", tenantId)
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      return Response.json(
        { error: "Failed to fetch outbox items", details: error.message },
        { status: 500 }
      );
    }

    // Return shape the relay expects
    return Response.json({ items: data ?? [] });
  } catch (error: any) {
    console.error('[ANPR Outbox] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
