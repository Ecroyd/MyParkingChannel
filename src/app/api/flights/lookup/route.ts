import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getTenantAviationstack } from "@/lib/flightProvider";

const CACHE_TTL_SECONDS = 60 * 10; // 10 minutes

type LookupBody = {
  tenantId: string;
  flightNumber: string; // e.g. "BA123"
  flightDate?: string; // "YYYY-MM-DD" (optional; provider may infer today's)
};

export async function POST(req: NextRequest) {
  try {
    const body: LookupBody = await req.json();
    const { tenantId, flightNumber, flightDate } = body;

    if (!tenantId || !flightNumber) {
      return NextResponse.json(
        { error: "tenantId and flightNumber are required" },
        { status: 400 }
      );
    }

    const provider = await getTenantAviationstack(tenantId);
    if (!provider) {
      return NextResponse.json(
        { error: "No active Aviationstack provider configured for tenant" },
        { status: 404 }
      );
    }

    const cacheKey = `${flightNumber}|${flightDate ?? "none"}`;

    // 1) Check cache
    const supa = supabaseAdmin();
    const { data: cacheRow } = await supa
      .from("flight_status_cache")
      .select("response, expires_at")
      .eq("tenant_id", tenantId)
      .eq("flight_query", cacheKey)
      .maybeSingle();

    if (cacheRow && new Date(cacheRow.expires_at) > new Date()) {
      const normalized = await normalizeAndPersist(
        tenantId,
        flightNumber,
        flightDate,
        cacheRow.response
      );
      return NextResponse.json({ source: "cache", ...normalized });
    }

    // 2) Provider fetch
    const url = new URL(provider.baseUrl);
    url.searchParams.set("access_key", provider.apiKey);
    url.searchParams.set("flight_iata", flightNumber); // Aviationstack accepts IATA flight like BA123
    if (flightDate) url.searchParams.set("flight_date", flightDate); // YYYY-MM-DD

    const res = await fetch(url.toString());
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: "Provider error", details: text },
        { status: 502 }
      );
    }

    const json = await res.json();

    // 3) Write cache
    const expiresAt = new Date(
      Date.now() + CACHE_TTL_SECONDS * 1000
    ).toISOString();
    await supa.from("flight_status_cache").upsert({
      tenant_id: tenantId,
      flight_query: cacheKey,
      response: json,
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt,
    });

    const normalized = await normalizeAndPersist(
      tenantId,
      flightNumber,
      flightDate,
      json
    );
    return NextResponse.json({ source: "provider", ...normalized });
  } catch (error: any) {
    console.error("Error in flight lookup:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function normalizeAndPersist(
  tenantId: string,
  flightNumber: string,
  flightDate: string | undefined,
  payload: any
) {
  // Aviationstack returns { data: [ ... ] }
  // Choose the best match (same flightNumber + date if present)
  const list = Array.isArray(payload?.data) ? payload.data : [];

  // Naive filter by date/flight_number
  const best =
    list.find((x: any) => {
      const iata = x?.flight?.iata || "";
      const d = x?.flight_date || x?.flight?.date || x?.date;
      const matchNumber =
        iata?.toUpperCase() === flightNumber.toUpperCase();
      const matchDate = flightDate ? d === flightDate : true;
      return matchNumber && matchDate;
    }) || list[0];

  if (!best) {
    return { ok: false, flight: null, raw: payload };
  }

  // Extract + coerce times to UTC (Aviationstack returns local times with timezone info)
  const status = best?.flight_status ?? null;
  const airline_iata = best?.airline?.iata || null;
  const airline_icao = best?.airline?.icao || null;
  const dep_iata = best?.departure?.iata || null;
  const arr_iata = best?.arrival?.iata || null;
  const sd = best?.departure?.scheduled
    ? new Date(best.departure.scheduled)
    : null;
  const sa = best?.arrival?.scheduled
    ? new Date(best.arrival.scheduled)
    : null;
  const ed = best?.departure?.estimated
    ? new Date(best.departure.estimated)
    : null;
  const ea = best?.arrival?.estimated
    ? new Date(best.arrival.estimated)
    : null;
  const dateForKey: string =
    flightDate ??
    (best?.flight_date ||
      (sd ? sd.toISOString().slice(0, 10) : null) ||
      new Date().toISOString().slice(0, 10));

  const upsert = {
    tenant_id: tenantId,
    flight_number: flightNumber.toUpperCase(),
    flight_date: dateForKey,
    airline_iata,
    airline_icao,
    dep_airport_iata: dep_iata,
    arr_airport_iata: arr_iata,
    scheduled_departure: sd ? sd.toISOString() : null,
    scheduled_arrival: sa ? sa.toISOString() : null,
    estimated_departure: ed ? ed.toISOString() : null,
    estimated_arrival: ea ? ea.toISOString() : null,
    status,
    raw: best,
    updated_at: new Date().toISOString(),
  };

  const supa = supabaseAdmin();
  const { error: upsertError } = await supa
    .from("flight_instances")
    .upsert(upsert, {
      onConflict: "tenant_id,flight_number,flight_date",
    });

  if (upsertError) {
    console.error("Error upserting flight instance:", upsertError);
    // Continue anyway - we still return the flight data
  }

  return { ok: true, flight: upsert, raw: best };
}

