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
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
    const debug = req.nextUrl.searchParams.get("debug") === "1";
    
    const auth = await requireRelayAuth(req, tenantId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const admin = supabaseAdmin();

    // Use RPC function to atomically claim items
    // This function:
    // 1. Requeues stale processing items (older than 10 minutes) back to pending
    // 2. Selects pending items with FOR UPDATE SKIP LOCKED
    // 3. Updates them to processing status
    // 4. Returns the claimed items
    const { data: claimedItems, error: rpcError } = await admin.rpc('anpr_outbox_claim', {
      p_tenant_id: tenantId,
      p_limit: limit,
    });

    if (rpcError) {
      console.error('[ANPR Outbox] RPC error:', rpcError);
      // Fallback: try without RPC if function doesn't exist yet
      if (rpcError.message?.includes('function') || rpcError.message?.includes('does not exist')) {
        console.warn('[ANPR Outbox] RPC function not found, using fallback method');
        return await fallbackClaimMethod(admin, tenantId, limit, debug);
      }
      return Response.json(
        { error: "Failed to claim outbox items", details: rpcError.message },
        { status: 500 }
      );
    }

    // Format items for response (RPC returns all fields, we need to map them)
    const items = (claimedItems || []).map((item: any) => ({
      id: item.id,
      booking_id: item.booking_id,
      plate: item.plate,
      group_number: item.group_number,
      valid_from: item.valid_from,
      valid_until: item.valid_until,
      action: item.action,
    }));

    // Get pending count for debug
    const pendingCount = debug
      ? await admin
          .from("anpr_outbox")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "pending")
      : null;

    return Response.json({
      ok: true,
      items: items,
      ...(debug && { 
        debug: { 
          pendingCount: pendingCount?.count ?? 0, 
          returned: items.length,
          claimed: items.length 
        } 
      }),
    });
  } catch (error: any) {
    console.error('[ANPR Outbox] Unexpected error:', error);
    return Response.json(
      { error: 'Internal server error', details: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}

/**
 * Fallback method if RPC function doesn't exist yet
 * Does the same operations but without FOR UPDATE SKIP LOCKED
 */
async function fallbackClaimMethod(
  admin: ReturnType<typeof supabaseAdmin>,
  tenantId: string,
  limit: number,
  debug: boolean
) {
  const staleCutoff = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

  // Step 1: Requeue stale processing items (increment retry_count)
  // Note: Supabase doesn't support incrementing in update, so we'd need to fetch and update
  // For now, just reset to pending - retry_count increment can be handled by RPC function
  const { error: requeueError } = await admin
    .from("anpr_outbox")
    .update({
      status: 'pending',
      error_message: null,
    })
    .eq("tenant_id", tenantId)
    .eq("status", "processing")
    .lt("updated_at", staleCutoff.toISOString());

  if (requeueError) {
    console.error('[ANPR Outbox] Failed to requeue stale items:', requeueError);
  }

  // Step 2: Select pending items
  const { data: pendingItems, error: selectError } = await admin
    .from("anpr_outbox")
    .select("id, booking_id, plate, group_number, valid_from, valid_until, action")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (selectError) {
    return Response.json(
      { error: "Failed to fetch outbox items", details: selectError.message },
      { status: 500 }
    );
  }

  if (!pendingItems || pendingItems.length === 0) {
    const pendingCount = debug
      ? await admin
          .from("anpr_outbox")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "pending")
      : null;

    return Response.json({
      ok: true,
      items: [],
      ...(debug && { debug: { pendingCount: pendingCount?.count ?? 0 } }),
    });
  }

  // Step 3: Update to processing (only if still pending)
  const itemIds = pendingItems.map((item) => item.id);
  const { error: updateError } = await admin
    .from("anpr_outbox")
    .update({ status: "processing" })
    .in("id", itemIds)
    .eq("status", "pending");

  if (updateError) {
    console.error("[ANPR Outbox] Failed to mark items as processing:", updateError);
    // Return items anyway
  }

  const pendingCount = debug
    ? await admin
        .from("anpr_outbox")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
    : null;

  return Response.json({
    ok: true,
    items: pendingItems,
    ...(debug && { 
      debug: { 
        pendingCount: pendingCount?.count ?? 0, 
        returned: pendingItems.length 
      } 
    }),
  });
}
