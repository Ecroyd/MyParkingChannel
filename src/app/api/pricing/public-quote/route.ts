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
export async function POST(req: NextRequest) {
  // Read body once at the start
  let body: { tenantId: string; startAt: string; endAt: string };
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { tenantId, startAt, endAt } = body;

  if (!tenantId || !startAt || !endAt) {
    return NextResponse.json(
      { error: "tenantId, startAt, and endAt are required" },
      { status: 400 }
    );
  }

  try {
    // Use calculateAvailability as the single source of truth
    // This includes pricing_rules + price_tiers + dynamic pricing
    const availability = await calculateAvailability({
      tenantId,
      startAt,
      endAt,
      currency: 'GBP',
      channel: 'direct', // Public widget uses direct channel
    });

    return NextResponse.json({
      success: true,
      data: {
        amount: availability.pricing.total_price,
        amount_cents: Math.round(availability.pricing.total_price * 100),
        currency: availability.currency.toUpperCase(),
        base_price: availability.pricing.base_price,
        dynamic_pricing_applied: availability.pricing.dynamicPricingApplied || false,
      },
    });
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

