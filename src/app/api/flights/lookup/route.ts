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

    console.log(`[FLIGHT LOOKUP] Starting lookup for flight: ${flightNumber}, date: ${flightDate || 'none'}, tenant: ${tenantId}`);

    if (!tenantId || !flightNumber) {
      console.error("[FLIGHT LOOKUP] Missing required fields:", { tenantId, flightNumber });
      return NextResponse.json(
        { error: "tenantId and flightNumber are required" },
        { status: 400 }
      );
    }

    const provider = await getTenantAviationstack(tenantId);
    if (!provider) {
      console.error(`[FLIGHT LOOKUP] No provider found for tenant: ${tenantId}`);
      return NextResponse.json(
        { error: "No active Aviationstack provider configured for tenant" },
        { status: 404 }
      );
    }

    console.log(`[FLIGHT LOOKUP] Provider found, baseUrl: ${provider.baseUrl}, hasApiKey: ${!!provider.apiKey}`);

    const cacheKey = `${flightNumber}|${flightDate ?? "none"}`;

    // 1) Check cache
    const supa = supabaseAdmin();
    const { data: cacheRow, error: cacheError } = await supa
      .from("flight_status_cache")
      .select("response, expires_at")
      .eq("tenant_id", tenantId)
      .eq("flight_query", cacheKey)
      .maybeSingle();

    if (cacheError) {
      console.error("[FLIGHT LOOKUP] Cache query error:", cacheError);
    }

    if (cacheRow && new Date(cacheRow.expires_at) > new Date()) {
      console.log("[FLIGHT LOOKUP] Using cached response");
      const normalized = await normalizeAndPersist(
        tenantId,
        flightNumber,
        flightDate,
        cacheRow.response
      );
      if (!normalized.ok) {
        console.warn("[FLIGHT LOOKUP] Cached response had no matching flight");
        return NextResponse.json({ 
          source: "cache", 
          ...normalized,
          error: normalized.error || "Flight not found in cached response"
        });
      }
      return NextResponse.json({ source: "cache", ...normalized });
    }

    // 2) Provider fetch
    const url = new URL(provider.baseUrl);
    url.searchParams.set("access_key", provider.apiKey);
    url.searchParams.set("flight_iata", flightNumber); // Aviationstack accepts IATA flight like BA123
    if (flightDate) url.searchParams.set("flight_date", flightDate); // YYYY-MM-DD
    
    // Add limit parameter to get more results (Aviationstack default is 100)
    url.searchParams.set("limit", "100");

    console.log(`[FLIGHT LOOKUP] Fetching from Aviationstack: ${url.toString().replace(/access_key=[^&]+/, 'access_key=***')}`);
    console.log(`[FLIGHT LOOKUP] Request parameters:`, {
      flight_iata: flightNumber,
      flight_date: flightDate || 'not set',
      limit: '100',
    });

    const res = await fetch(url.toString());
    const responseText = await res.text();
    
    if (!res.ok) {
      console.error(`[FLIGHT LOOKUP] Aviationstack API error (${res.status}):`, responseText);
      return NextResponse.json(
        { error: "Provider error", details: responseText },
        { status: 502 }
      );
    }

    let json: any;
    try {
      json = JSON.parse(responseText);
    } catch (parseError) {
      console.error("[FLIGHT LOOKUP] Failed to parse API response:", parseError, "Response:", responseText);
      return NextResponse.json(
        { error: "Invalid response from provider", details: responseText.substring(0, 200) },
        { status: 502 }
      );
    }

    console.log(`[FLIGHT LOOKUP] API response received. Has data array: ${Array.isArray(json?.data)}, Length: ${json?.data?.length || 0}`);
    console.log(`[FLIGHT LOOKUP] Full API response structure:`, {
      hasData: !!json?.data,
      dataLength: json?.data?.length,
      pagination: json?.pagination,
      error: json?.error,
      success: json?.success,
      firstKeys: Object.keys(json || {}).slice(0, 10),
    });
    
    // Log the actual response text for debugging (first 500 chars)
    if (json?.data?.length === 0) {
      console.warn(`[FLIGHT LOOKUP] Empty data array. Full response (first 500 chars):`, responseText.substring(0, 500));
    }
    
    // Check for API errors in response
    if (json.error) {
      console.error("[FLIGHT LOOKUP] Aviationstack API returned error:", json.error);
      return NextResponse.json(
        { error: json.error.info || json.error.message || "API error", details: json },
        { status: 400 }
      );
    }

    // Check if API returned success: false
    if (json.success === false) {
      console.error("[FLIGHT LOOKUP] Aviationstack API returned success: false", json);
      return NextResponse.json(
        { error: json.error?.info || "API request failed", details: json },
        { status: 400 }
      );
    }

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

    if (!normalized.ok) {
      console.warn(`[FLIGHT LOOKUP] No matching flight found. API returned ${json?.data?.length || 0} results. Payload structure:`, {
        hasData: !!json?.data,
        dataLength: json?.data?.length,
        firstItem: json?.data?.[0] ? {
          flight_iata: json.data[0]?.flight?.iata,
          flight_date: json.data[0]?.flight_date || json.data[0]?.flight?.date,
        } : null,
      });
      
      // Provide more helpful error message
      let errorMessage = "Flight not found";
      if (json?.data?.length === 0) {
        errorMessage = `No flights found for ${flightNumber}${flightDate ? ` on ${flightDate}` : ''}. The flight may not exist in Aviationstack's database, or the flight number format may be incorrect. Try using the IATA format (e.g., BA123) or include a specific date.`;
      } else {
        errorMessage = normalized.error || "Flight not found in API response";
      }
      
      return NextResponse.json({ 
        source: "provider", 
        ...normalized,
        error: errorMessage
      });
    }

    return NextResponse.json({ source: "provider", ...normalized });
  } catch (error: any) {
    console.error("[FLIGHT LOOKUP] Unexpected error:", error);
    console.error("[FLIGHT LOOKUP] Error stack:", error.stack);
    return NextResponse.json(
      { error: error.message || "Internal server error", details: error.stack },
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

  console.log(`[NORMALIZE] Processing ${list.length} flights from API response`);
  console.log(`[NORMALIZE] Looking for flight: ${flightNumber}, date: ${flightDate || 'any'}`);

  if (list.length === 0) {
    console.warn("[NORMALIZE] API returned empty data array");
    return { ok: false, flight: null, raw: payload, error: "No flights found in API response" };
  }

  // Log first few flights for debugging
  if (list.length > 0) {
    console.log(`[NORMALIZE] Sample flights:`, list.slice(0, 3).map((x: any) => ({
      iata: x?.flight?.iata,
      icao: x?.flight?.icao,
      number: x?.flight?.number,
      date: x?.flight_date || x?.flight?.date,
    })));
  }

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
    console.warn("[NORMALIZE] No matching flight found after filtering");
    return { ok: false, flight: null, raw: payload, error: "No matching flight found" };
  }

  console.log(`[NORMALIZE] Found matching flight:`, {
    iata: best?.flight?.iata,
    date: best?.flight_date || best?.flight?.date,
  });

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

