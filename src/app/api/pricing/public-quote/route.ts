import { NextRequest, NextResponse } from "next/server";
import { getQuoteCents } from "@/lib/pricing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, startAt, endAt } = body;

    if (!tenantId || !startAt || !endAt) {
      return NextResponse.json(
        { error: "tenantId, startAt, and endAt are required" },
        { status: 400 }
      );
    }

    // Use the proper pricing calculation
    const quote = await getQuoteCents(tenantId, startAt, endAt);

    return NextResponse.json({
      success: true,
      data: {
        amount: quote.amount_cents / 100, // Convert cents to dollars/pounds
        amount_cents: quote.amount_cents,
        currency: quote.currency.toUpperCase(),
      },
    });
  } catch (error: any) {
    console.error("Error calculating quote:", error);
    return NextResponse.json(
      { error: error.message || "Failed to calculate quote" },
      { status: 500 }
    );
  }
}

