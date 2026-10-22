// src/app/api/_debug/host/route.ts
import { NextResponse } from "next/server";
import { requirePlatformAdminApi } from '@/lib/auth/apiGuards';

function getTenantSlugFromHost(hostname: string): string | null {
  const host = (hostname || "").toLowerCase().split(":")[0];
  if (host === "localhost") return null;
  if (host.endsWith(".localhost")) {
    const sub = host.slice(0, -".localhost".length);
    return sub || null;
  }
  const APEX = ["myparkingchannel.app"];
  if (APEX.some((d) => host === d || host === `www.${d}`)) return null;
  const parts = host.split(".");
  if (parts.length > 2) return parts[0];
  return null;
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requirePlatformAdminApi();
  if (guard.response) return guard.response;
  const url = new URL(req.url);
  const host = url.host;
  const slug = getTenantSlugFromHost(host);
  return NextResponse.json({ host, slug });
}
