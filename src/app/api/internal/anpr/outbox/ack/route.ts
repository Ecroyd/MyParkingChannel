// POST /api/internal/anpr/outbox/ack - Acknowledge processed items
// Authenticated via per-tenant relay token (x-relay-token header or Bearer)
// Lease model: ACK success = mark completed, ACK failure = requeue to pending

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRelayAuth } from "../../_relayAuth";

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    // Relay token auth check
    const auth = await requireRelayAuth(req, tenantId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabase = supabaseAdmin();

    const body = await req.json().catch(() => null);
    const itemIds: string[] = body?.itemIds;
    const success: boolean = body?.success;
    const errorMsg: string | undefined = body?.error;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json({ error: "itemIds must be a non-empty array" }, { status: 400 });
    }
    if (typeof success !== "boolean") {
      return NextResponse.json({ error: "success must be a boolean" }, { status: 400 });
    }

    if (success) {
      // Mark completed
      const { data, error } = await supabase
        .from("anpr_outbox")
        .update({
          status: "completed",
          processed_at: new Date().toISOString(),
          error_message: null,
          leased_at: null,
          lease_expires_at: null,
        })
        .eq("tenant_id", tenantId)
        .in("id", itemIds)
        .is("processed_at", null)
        .select("id");

      if (error) {
        console.error('[ANPR Outbox ACK] Update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ 
        ok: true, 
        found: data?.length ?? 0, 
        requested: itemIds.length 
      });
    } else {
      // Requeue (critical: prevents no-man's-land)
      const { data, error } = await supabase
        .from("anpr_outbox")
        .update({
          status: "pending",
          error_message: errorMsg ?? "relay_failed",
          leased_at: null,
          lease_expires_at: null,
        })
        .eq("tenant_id", tenantId)
        .in("id", itemIds)
        .is("processed_at", null)
        .select("id");

      if (error) {
        console.error('[ANPR Outbox ACK] Requeue error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ 
        ok: true, 
        requeued: true, 
        found: data?.length ?? 0, 
        requested: itemIds.length 
      });
    }
  } catch (error: any) {
    console.error('[ANPR Outbox ACK] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
