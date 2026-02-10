import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/guards";

export const dynamic = "force-dynamic";

/**
 * Returns redacted env status for platform admin UI.
 * Values are never exposed; only whether each key is set.
 */
export async function GET() {
  try {
    await requirePlatformAdmin();
    return NextResponse.json({
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
  } catch (e: any) {
    if (e?.message?.includes("Forbidden") || e?.message?.includes("Not authenticated")) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
