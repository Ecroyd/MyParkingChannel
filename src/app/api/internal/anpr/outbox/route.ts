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
    const { data: claimedData, error: claimError } = await supabase.rpc("anpr_outbox_claim", {
      p_tenant_id: tenantId,
      p_limit: limit,
      p_lease_seconds: LEASE_SECONDS,
    });

    if (claimError) {
      console.error('[ANPR Outbox] RPC error:', claimError);
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }

    if (!claimedData || claimedData.length === 0) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    // 2) Enrich claimed items with booking data via join
    const claimedIds = claimedData.map((item: any) => item.id);
    const { data, error } = await supabase
      .from("anpr_outbox")
      .select(`
        id,
        booking_id,
        plate,
        group_number,
        valid_from,
        valid_until,
        action,
        bookings:booking_id (
          reference,
          customer_name,
          customer_email,
          customer_phone,
          car_make,
          car_model,
          car_color
        )
      `)
      .eq("tenant_id", tenantId)
      .in("id", claimedIds);

    if (error) {
      console.error('[ANPR Outbox] Join query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map enriched data into the JSON shape the relay expects
    const items = (data ?? []).map((row: any) => ({
      id: row.id,
      booking_id: row.booking_id,
      plate: row.plate,
      group_number: row.group_number,
      valid_from: row.valid_from,
      valid_until: row.valid_until,
      action: row.action,

      // enriched fields for relay → Videofit
      make: row.bookings?.car_make ?? "",
      model: row.bookings?.car_model ?? "",
      colour: row.bookings?.car_color ?? "",
      driver_full_name: row.bookings?.customer_name ?? "",
      driver_phone: row.bookings?.customer_phone ?? "",
      driver_email: row.bookings?.customer_email ?? "",
      driver_comp: row.bookings?.reference ? `REF=${row.bookings.reference}` : "",
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
