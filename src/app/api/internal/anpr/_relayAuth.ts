// src/app/api/internal/anpr/_relayAuth.ts
import { NextRequest } from "next/server";
import { getRelayTokenFromRequest, verifyRelayToken } from "@/lib/anpr/relayTokenAuth";

/**
 * Relay auth for /api/internal/anpr/* (outbox, ack, snapshot).
 * Token from x-relay-token / Authorization: Bearer (preferred) or ?token=.
 * Accepts the legacy env token for tenant bab45dab-…, the anpr_sites hash (rotate-token) or the
 * tenant_secrets relay token (admin relay-token/generate). See src/lib/anpr/relayTokenAuth.ts.
 */
export async function requireRelayAuth(req: NextRequest, tenantId: string) {
  const token = getRelayTokenFromRequest(req);
  const result = await verifyRelayToken(tenantId, token, { requireEnabledSite: true });
  if (!result.ok) {
    return { ok: false as const, status: result.status, error: result.error };
  }
  return { ok: true as const, site: result.site };
}
