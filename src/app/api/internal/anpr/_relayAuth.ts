// src/app/api/internal/anpr/_relayAuth.ts
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

function getRelayToken(req: NextRequest) {
  // support either header, but prefer x-relay-token
  const x = req.headers.get("x-relay-token")?.trim();
  const auth = req.headers.get("authorization")?.trim();

  if (x) return x;
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function requireRelayAuth(req: NextRequest, tenantId: string) {
  const token = getRelayToken(req);

  if (!tenantId) {
    return { ok: false as const, status: 400, error: "Missing tenantId" };
  }

  if (!token) {
    return { ok: false as const, status: 401, error: "Invalid or missing relay token" };
  }

  // TEMP: For tenant bab45dab-19e8-4230-b18e-ee1f663608e5, check env var (plain comparison)
  const TARGET_TENANT = "bab45dab-19e8-4230-b18e-ee1f663608e5";
  if (tenantId === TARGET_TENANT) {
    const expected = process.env.ANPR_RELAY_TOKEN_BAB45DAB;
    if (!expected) {
      return { ok: false as const, status: 500, error: "Server missing ANPR relay token env" };
    }
    if (token !== expected) {
      return { ok: false as const, status: 401, error: "Invalid or missing relay token" };
    }
    return { ok: true as const, site: { id: 'temp', tenant_id: tenantId } };
  }

  // For other tenants, check against anpr_sites table with hash comparison
  const supabase = supabaseAdmin();

  // Try anpr_sites (table stores relay_token_hash)
  const { data: site, error } = await supabase
    .from("anpr_sites")
    .select("id, tenant_id, relay_token_hash, enabled")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    console.error('[ANPR Auth] Lookup error:', error);
    return { ok: false as const, status: 500, error: "Auth lookup failed" };
  }

  if (!site) {
    return { ok: false as const, status: 401, error: "Invalid or missing relay token" };
  }

  // Hash the provided token and compare with stored hash
  const providedHash = createHash("sha256").update(token).digest("hex").toLowerCase();
  const storedHash = site.relay_token_hash.toLowerCase();

  if (providedHash !== storedHash) {
    return { ok: false as const, status: 401, error: "Invalid or missing relay token" };
  }

  // Check if site is enabled
  if (!site.enabled) {
    return { ok: false as const, status: 403, error: "ANPR site is not enabled" };
  }

  return { ok: true as const, site };
}
