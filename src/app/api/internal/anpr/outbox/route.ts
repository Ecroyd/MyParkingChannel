// GET /api/internal/anpr/outbox - Poll pending vehicle updates (NON-DESTRUCTIVE)
// Authenticated via per-tenant relay token (x-relay-token header or Bearer)

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireRelayAuth } from '../_relayAuth';

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get("tenantId") ?? "";
    const auth = await requireRelayAuth(req, tenantId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const admin = supabaseAdmin();

    // Fetch only status='pending' rows with required fields
    const { data, error } = await admin
      .from("anpr_outbox")
      .select("id, plate, group_number, valid_from, valid_until, action")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
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
    return Response.json(
      { error: 'Internal server error', details: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
