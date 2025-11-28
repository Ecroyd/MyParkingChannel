// src/app/api/supplier/v1/availability/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authenticatePartnerApiKey } from "@/lib/partners/auth";

// Helper: naive nights calculation
function calculateNights(arrivalIso: string, departureIso: string): number {
  const start = new Date(arrivalIso);
  const end = new Date(departureIso);
  const diffMs = end.getTime() - start.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return Math.max(1, Math.round(diffDays));
}

export async function GET(req: NextRequest) {
  const auth = await authenticatePartnerApiKey(req.headers);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const productCode = searchParams.get("product_code");
  const arrival = searchParams.get("arrival");
  const departure = searchParams.get("departure");

  if (!productCode || !arrival || !departure) {
    return NextResponse.json(
      { error: "Missing required query params: product_code, arrival, departure" },
      { status: 400 }
    );
  }

  // TODO: Plug in your real capacity & pricing logic here.
  // For now, we just calculate nights * flat rate.
  const nights = calculateNights(arrival, departure);
  const baseRatePerNight = 8.0; // TEMP: replace with real tariff lookup
  const total = Number((nights * baseRatePerNight).toFixed(2));

  return NextResponse.json({
    product_code: productCode,
    arrival,
    departure,
    available: true,       // TODO: run real capacity check here
    currency: "GBP",
    total_price: total,
    breakdown: {
      base_price: total,
      surcharges: 0,
      nights,
    },
    max_spaces_available: 999, // TODO: replace with real remaining capacity
  });
}

