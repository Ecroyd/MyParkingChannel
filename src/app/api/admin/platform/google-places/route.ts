import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/guards";
import {
  getGooglePlacesPlatformStatus,
  saveGooglePlacesApiKey,
} from "@/lib/google/places-reviews";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const status = await getGooglePlacesPlatformStatus();
    // Never return the API key
    return NextResponse.json({
      success: true,
      settings: {
        configured: status.configured,
        is_enabled: status.isEnabled,
        has_env_fallback: status.hasEnvFallback,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Forbidden";
    if (String(message).includes("Forbidden")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePlatformAdmin();
    const body = await req.json();
    const apiKey =
      typeof body.api_key === "string" && body.api_key.trim() ? body.api_key.trim() : null;
    const isEnabled = Boolean(body.is_enabled);

    const saved = await saveGooglePlacesApiKey({ apiKey, isEnabled });
    if (!saved.ok) {
      return NextResponse.json({ success: false, error: saved.error }, { status: 400 });
    }

    const status = await getGooglePlacesPlatformStatus();
    return NextResponse.json({
      success: true,
      settings: {
        configured: status.configured,
        is_enabled: status.isEnabled,
        has_env_fallback: status.hasEnvFallback,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Forbidden";
    if (String(message).includes("Forbidden")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
