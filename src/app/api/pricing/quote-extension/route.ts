// src/app/api/pricing/quote-extension/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from '@/lib/supabase/server';
import { quoteExtensionCents } from "@/lib/pricing/quoteExtension";

export async function POST(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "UNAUTH" }, { status: 401 });

    const body = await req.json();
    const { tenantId, bookingEndAtISO, newEndAtISO } = body;

    if (!tenantId || !bookingEndAtISO || !newEndAtISO) {
      return NextResponse.json({ ok: false, error: "MISSING_PARAMS" }, { status: 400 });
    }

    console.log(`[quote-extension] Calculating quote for tenant ${tenantId}, from ${bookingEndAtISO} to ${newEndAtISO}`);
    
    const quoteCents = await quoteExtensionCents({
      tenantId,
      bookingEndAtISO,
      newEndAtISO,
    });

    console.log(`[quote-extension] Quote calculated: ${quoteCents} cents (${(quoteCents/100).toFixed(2)} GBP)`);

    return NextResponse.json({ ok: true, quoteCents });
  } catch (e: any) {
    console.error("Quote error:", e);
    return NextResponse.json({ ok: false, error: e.message ?? "ERROR" }, { status: 500 });
  }
}
