import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMatrixPriceForStay } from "@/lib/pricing/matrix";

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
    // Get tenant's currency from tenant_pricing
    const supabase = createAdminClient();
    const { data: tenantPricing } = await supabase
      .from('tenant_pricing')
      .select('currency')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    
    const currency = tenantPricing?.currency || 'GBP';

    // Find the product for this tenant (same logic as availability engine)
    let productId: string;
    const { data: standardProduct } = await supabase
      .from('products')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('code', 'STANDARD')
      .eq('is_active', true)
      .maybeSingle();

    if (!standardProduct) {
      const { data: altProduct } = await supabase
        .from('products')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!altProduct) {
        // Fallback to simple pricing if no products exist
        const { getQuoteCents } = await import('@/lib/pricing');
        const quote = await getQuoteCents(tenantId, startAt, endAt);
        return NextResponse.json({
          success: true,
          data: {
            amount: quote.amount_cents / 100,
            amount_cents: quote.amount_cents,
            currency: quote.currency.toUpperCase(),
          },
        });
      }
      productId = altProduct.id;
    } else {
      productId = standardProduct.id;
    }

    // Use the pricing matrix (pricing_rules + price_tiers)
    const pricingInfo = await getMatrixPriceForStay({
      tenantId,
      productId,
      startAt,
      endAt,
      currency,
      channelCode: 'agent', // Use 'agent' channel for public widget
    });

    return NextResponse.json({
      success: true,
      data: {
        amount: pricingInfo.totalPrice,
        amount_cents: Math.round(pricingInfo.totalPrice * 100),
        currency: currency.toUpperCase(),
      },
    });
  } catch (error: any) {
    console.error("Error calculating quote with matrix pricing:", error);
    
    // If matrix pricing fails, fallback to simple pricing
    try {
      const { getQuoteCents } = await import('@/lib/pricing');
      const quote = await getQuoteCents(tenantId, startAt, endAt);
      console.log("Fell back to simple pricing calculation");
      return NextResponse.json({
        success: true,
        data: {
          amount: quote.amount_cents / 100,
          amount_cents: quote.amount_cents,
          currency: quote.currency.toUpperCase(),
        },
      });
    } catch (fallbackError: any) {
      console.error("Fallback pricing also failed:", fallbackError);
      return NextResponse.json(
        { error: error.message || "Failed to calculate quote" },
        { status: 500 }
      );
    }
  }
}

