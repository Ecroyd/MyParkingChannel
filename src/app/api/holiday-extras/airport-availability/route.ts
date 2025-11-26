import { NextRequest, NextResponse } from "next/server";
import { getHolidayExtrasConfig } from "@/lib/tenantSecrets/holidayExtras";
import { HolidayExtrasClient } from "@/lib/holidayExtrasClient";
import { resolveTenantIdOrThrow } from "@/lib/tenant/resolve";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const airportCode = searchParams.get("airportCode");
    const arrivalDate = searchParams.get("arrivalDate");
    const arrivalTime = searchParams.get("arrivalTime");
    const departDate = searchParams.get("departDate");
    const departTime = searchParams.get("departTime");

    if (!airportCode || !arrivalDate || !arrivalTime || !departDate || !departTime) {
      return NextResponse.json(
        { error: "Missing required query params" },
        { status: 400 }
      );
    }

    const tenantId = await resolveTenantIdOrThrow(new URL(req.url));
    if (!tenantId) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 400 });
    }

    const cfg = await getHolidayExtrasConfig(tenantId);
    if (!cfg) {
      return NextResponse.json(
        { error: "Holiday Extras not configured for this tenant" },
        { status: 400 }
      );
    }

    const client = new HolidayExtrasClient(cfg);

    const availability = await client.airportAvailability({
      airportCode,
      arrivalDate,
      arrivalTime,
      departDate,
      departTime,
    });

    return NextResponse.json({ data: availability });
  } catch (err: any) {
    console.error("Holiday Extras airport availability error:", err);
    return NextResponse.json(
      { error: "Failed to fetch Holiday Extras availability" },
      { status: 500 }
    );
  }
}

