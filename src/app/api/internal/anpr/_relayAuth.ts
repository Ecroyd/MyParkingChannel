import { NextRequest } from "next/server";

export function getRelayToken(req: NextRequest): string | null {
  const x = req.headers.get("x-relay-token");
  if (x && x.trim()) return x.trim();

  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  const url = new URL(req.url);
  const qp = url.searchParams.get("token");
  if (qp && qp.trim()) return qp.trim();

  return null;
}

export function requireRelayTokenForTenant(req: NextRequest, tenantId: string): Response | null {
  // TEMP: single-tenant hardcoded allowlist
  const TARGET_TENANT = "bab45dab-19e8-4230-b18e-ee1f663608e5";
  if (tenantId !== TARGET_TENANT) {
    return Response.json({ error: "Relay not configured for tenant" }, { status: 401 });
  }

  const expected = process.env.ANPR_RELAY_TOKEN_BAB45DAB;
  if (!expected) {
    return Response.json({ error: "Server missing ANPR relay token env" }, { status: 500 });
  }

  const token = getRelayToken(req);
  if (!token || token !== expected) {
    return Response.json({ error: "Invalid or missing relay token" }, { status: 401 });
  }

  return null;
}

