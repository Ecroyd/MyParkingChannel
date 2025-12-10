import { NextRequest, NextResponse } from "next/server";
import { calculateAvailability } from "@/lib/availability/engine";
import { calculateStayDays } from "@/lib/pricing/stayLength";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public pricing API - uses new pricing engine (pricing_rules + price_tiers + dynamic pricing)
 * 
 * This endpoint maintains backward compatibility but now uses calculateAvailability
 * as the single source of truth for pricing calculations.
 * 
 * GET /api/pricing/public?tenantId=...&start_at=...&end_at=...
 * 
 * If start_at and end_at are provided, returns full quote.
 * Otherwise, returns a simple daily rate estimate (for backward compatibility).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  const start_at = searchParams.get("start_at") || searchParams.get("startAt");
  const end_at = searchParams.get("end_at") || searchParams.get("endAt");
  const passengers = searchParams.get("passengers");
  
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant ID is required" }, { status: 400 });
  }

  // If dates are provided, use the full pricing calculation
  if (start_at && end_at) {
    try {
      const availability = await calculateAvailability({
        tenantId,
        startAt: start_at,
        endAt: end_at,
        currency: 'GBP',
        channel: 'direct',
      });

      // Return in the format expected by the widget
      // Use centralized stay length calculation
      const days = calculateStayDays(new Date(start_at), new Date(end_at));
      const dailyRate = days > 0 ? availability.pricing.total_price / days : availability.pricing.base_price;

      return NextResponse.json({
        success: true,
        data: {
          dailyRate: dailyRate,
          currency: availability.currency.toUpperCase(),
          amount: availability.pricing.total_price,
          amount_cents: Math.round(availability.pricing.total_price * 100),
          base_price: availability.pricing.base_price,
          dynamic_pricing_applied: availability.pricing.dynamicPricingApplied || false,
        },
      });
    } catch (error: any) {
      console.error("Error calculating pricing:", error);
      // Fall back to default on error
      return NextResponse.json({ 
        success: true, 
        data: { dailyRate: 7.0, currency: "GBP" } 
      });
    }
  }

  // Backward compatibility: if no dates, return a default daily rate
  // This is used by the widget's loadPricing() function
  // In the future, we could calculate this from pricing_rules, but for now keep it simple
  return NextResponse.json({ 
    success: true, 
    data: { dailyRate: 7.0, currency: "GBP" } 
  });
}
