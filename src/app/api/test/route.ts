import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ 
    message: "Test endpoint working",
    timestamp: new Date().toISOString(),
    env: {
      SITE_ROUTES_ENABLED: process.env.SITE_ROUTES_ENABLED,
      NODE_ENV: process.env.NODE_ENV
    }
  });
}
