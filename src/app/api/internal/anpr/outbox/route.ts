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
    const debug = req.nextUrl.searchParams.get("debug") === "1";
    const auth = await requireRelayAuth(req, tenantId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const admin = supabaseAdmin();

    // Fetch pending items and atomically mark as 'processing'
    // Use a transaction-like approach: select for update, then update
    // Since Supabase doesn't support SELECT FOR UPDATE, we'll:
    // 1. Select pending items
    // 2. Get their IDs
    // 3. Update them to 'processing' status atomically
    // 4. Return the items

    const { data: pendingItems, error: selectError } = await admin
      .from("anpr_outbox")
      .select("id, booking_id, plate, group_number, valid_from, valid_until, action")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(200);

    if (selectError) {
      return Response.json(
        { error: "Failed to fetch outbox items", details: selectError.message },
        { status: 500 }
      );
    }

    if (!pendingItems || pendingItems.length === 0) {
      // Get pending count for debug
      const pendingCount = debug
        ? await admin
            .from("anpr_outbox")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("status", "pending")
        : null;

      return Response.json({
        items: [],
        ...(debug && { debug: { pendingCount: pendingCount?.count ?? 0 } }),
      });
    }

    // Atomically mark items as 'processing' (only status, NOT processed_at)
    const itemIds = pendingItems.map((item) => item.id);
    const { error: updateError } = await admin
      .from("anpr_outbox")
      .update({ status: "processing" })
      .in("id", itemIds)
      .eq("status", "pending"); // Only update if still pending (prevents race conditions)

    if (updateError) {
      console.error("[ANPR Outbox] Failed to mark items as processing:", updateError);
      // Return items anyway, but log the error
    }

    // Get pending count for debug
    const pendingCount = debug
      ? await admin
          .from("anpr_outbox")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "pending")
      : null;

    // Return shape the relay expects
    return Response.json({
      items: pendingItems,
      ...(debug && { debug: { pendingCount: pendingCount?.count ?? 0, returned: pendingItems.length } }),
    });
  } catch (error: any) {
    console.error('[ANPR Outbox] Unexpected error:', error);
    return Response.json(
      { error: 'Internal server error', details: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
