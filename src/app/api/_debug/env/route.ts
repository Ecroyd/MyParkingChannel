import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function tail(s?: string | null) {
  if (!s) return null;
  return s.length > 12 ? `${s.slice(0,6)}…${s.slice(-6)}` : "****";
}

export async function GET() {
  let urlHost = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  try { urlHost = new URL(urlHost).host; } catch {}
  return NextResponse.json({
    SITE_ROUTES_ENABLED: process.env.SITE_ROUTES_ENABLED,
    supabase: {
      urlHost,
      anonKeyTail: tail(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      serviceRolePresent: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });
}
