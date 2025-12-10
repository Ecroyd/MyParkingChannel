import { NextRequest, NextResponse } from "next/server";
import { calculateAvailability } from "@/lib/availability/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public quote API - single source of truth for pricing calculation
 * Uses calculateAvailability which includes:
 * - pricing_rules + price_tiers (LOS matrix)
 * - Dynamic pricing (if enabled)
 * - All pricing logic in one place
 */

type QuoteParams = {
  tenantId: string;
  startAt: string;
  endAt: string;
  passengers?: number;
};

async function handleQuote(params: QuoteParams) {
  const { tenantId, startAt, endAt, passengers = 1 } = params;

  // Use calculateAvailability as the single source of truth
  // This includes pricing_rules + price_tiers + dynamic pricing
  const availability = await calculateAvailability({
    tenantId,
    startAt,
    endAt,
    currency: 'GBP',
    channel: 'direct', // Public widget uses direct channel
  });

  return {
    success: true,
    data: {
      amount: availability.pricing.total_price,
      amount_cents: Math.round(availability.pricing.total_price * 100),
      currency: availability.currency.toUpperCase(),
      base_price: availability.pricing.base_price,
      dynamic_pricing_applied: availability.pricing.dynamicPricingApplied || false,
    },
  };
}

// GET /api/pricing/public-quote?tenantId=...&startAt=...&endAt=...&passengers=...
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get("tenantId");
  const startAt = url.searchParams.get("startAt") || url.searchParams.get("start_at");
  const endAt = url.searchParams.get("endAt") || url.searchParams.get("end_at");
  const passengers = url.searchParams.get("passengers");

  if (!tenantId || !startAt || !endAt) {
    return NextResponse.json(
      { error: "tenantId, startAt (or start_at), and endAt (or end_at) are required" },
      { status: 400 }
    );
  }

  try {
    const result = await handleQuote({
      tenantId,
      startAt,
      endAt,
      passengers: passengers ? Number(passengers) : undefined,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error calculating quote:", error);
    return NextResponse.json(
      { 
        error: error.message || "Failed to calculate quote",
        details: error.stack 
      },
      { status: 500 }
    );
  }
}

// POST /api/pricing/public-quote
// Body: { tenantId, startAt (or start_at), endAt (or end_at), passengers? }
export async function POST(req: NextRequest) {
  let body: { tenantId: string; startAt?: string; start_at?: string; endAt?: string; end_at?: string; passengers?: number };
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const tenantId = body.tenantId;
  const startAt = body.startAt || body.start_at;
  const endAt = body.endAt || body.end_at;
  const passengers = body.passengers;

  if (!tenantId || !startAt || !endAt) {
    return NextResponse.json(
      { error: "tenantId, startAt (or start_at), and endAt (or end_at) are required" },
      { status: 400 }
    );
  }

  try {
    const result = await handleQuote({
      tenantId,
      startAt,
      endAt,
      passengers,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error calculating quote:", error);
    return NextResponse.json(
      { 
        error: error.message || "Failed to calculate quote",
        details: error.stack 
      },
      { status: 500 }
    );
  }
}

