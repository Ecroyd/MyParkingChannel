import { NextResponse } from "next/server";
import { requirePlatformAdminApi } from '@/lib/auth/apiGuards';

export async function GET() {
  const guard = await requirePlatformAdminApi();
  if (guard.response) return guard.response;
  return NextResponse.json({ 
    message: "Test endpoint working",
    timestamp: new Date().toISOString(),
    env: {
      SITE_ROUTES_ENABLED: process.env.SITE_ROUTES_ENABLED,
      NODE_ENV: process.env.NODE_ENV
    }
  });
}
