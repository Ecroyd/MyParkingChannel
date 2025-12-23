// GET /api/internal/anpr/outbox - Poll pending vehicle updates
// Authenticated via per-tenant relay token (x-relay-token header or Bearer)
// Lease model: returns pending items AND processing items whose lease expired
// Atomically marks returned rows as processing + sets lease expiry

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRelayAuth } from "../_relayAuth";

const LEASE_SECONDS = 300; // 5 minutes

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    // Relay token auth check
    const auth = await requireRelayAuth(req, tenantId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabase = supabaseAdmin();

    // 1) Pick eligible rows: pending OR processing with expired lease
    // 2) Mark them processing with a fresh lease
    // This MUST be atomic -> done with RPC function
    const { data, error } = await supabase.rpc("anpr_outbox_claim", {
      p_tenant_id: tenantId,
      p_limit: limit,
      p_lease_seconds: LEASE_SECONDS,
    });

    if (error) {
      console.error('[ANPR Outbox] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Format items for response (only return needed fields)
    const items = (data ?? []).map((item: any) => ({
      id: item.id,
      booking_id: item.booking_id,
      plate: item.plate,
      group_number: item.group_number,
      valid_from: item.valid_from,
      valid_until: item.valid_until,
      action: item.action,
    }));

    return NextResponse.json({ items: items }, { status: 200 });
  } catch (error: any) {
    console.error('[ANPR Outbox] Unexpected error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
