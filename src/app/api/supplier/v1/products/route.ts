// src/app/api/supplier/v1/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authenticatePartnerApiKey } from "@/lib/partners/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = await authenticatePartnerApiKey(req.headers);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // TODO: Replace this with a real "car park products for this tenant" lookup.
  // e.g. tenant_sites, tenant_products, etc.
  const { data: tenantProfile } = await supabase
    .from("tenant_public_profile")
    .select("business_name")
    .eq("tenant_id", auth.tenantId)
    .maybeSingle();

  const displayName = tenantProfile?.business_name || "Car Park";
  const airportCode = null; // TODO: add airport_code field to tenant_public_profile if needed

  return NextResponse.json({
    products: [
      {
        id: `default-${auth.tenantId}`,
        code: `DEFAULT_${auth.tenantId}`, // partner-facing product code
        name: displayName,
        description: "Standard airport parking",
        airport_code: airportCode,
        type: "park_and_ride", // or "meet_and_greet", "on_airport"
        currency: "GBP",
        min_stay_days: 1,
        max_stay_days: 60,
        tags: ["default"],
      },
    ],
  });
}

