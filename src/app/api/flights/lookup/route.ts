import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  getActiveProviders,
  getAirlineOverrides,
  extractAirlineIataPrefix,
  ProviderCfg,
} from "@/lib/flightProviders";
import {
  fetchFromAviationstack,
  fetchFromAeroDataBox,
  NormalizedFlight,
} from "@/lib/flightAdapters";

const CACHE_TTL_SECONDS = 60 * 10; // 10 minutes

type LookupBody = {
  tenantId: string;
  flightNumber: string; // e.g. "FR6421"
  flightDate?: string; // YYYY-MM-DD
};

export async function POST(req: NextRequest) {
  try {
    const body: LookupBody = await req.json();
    const { tenantId, flightNumber, flightDate } = body;

    console.log(
      `[FLIGHT LOOKUP] Starting lookup for flight: ${flightNumber}, date: ${flightDate || "none"}, tenant: ${tenantId}`
    );

    if (!tenantId || !flightNumber) {
      console.error("[FLIGHT LOOKUP] Missing required fields:", {
        tenantId,
        flightNumber,
      });
      return NextResponse.json(
        { error: "tenantId and flightNumber are required" },
        { status: 400 }
      );
    }

    const airline = extractAirlineIataPrefix(flightNumber) || "";
    const cacheKey = `${flightNumber.toUpperCase()}|${flightDate ?? "none"}`;

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
      const cached = cacheRow.response;
      if (cached?.normalized) {
        const norm: NormalizedFlight = cached.normalized;
        await upsertInstance(tenantId, flightNumber, flightDate, norm);
        return NextResponse.json({
          source: cached.provider || "cache",
          ok: true,
          flight: buildUpsertObj(flightNumber, flightDate, norm),
          raw: norm.raw,
        });
      } else if (cached?.normalized === null) {
        // Negative cache hit
        return NextResponse.json({
          ok: false,
          error: "No data from providers (cached)",
        });
      }
    }

    // 2) Provider order: airline overrides first, then all active by priority
    const providers = await getActiveProviders(tenantId);
    if (!providers.length) {
      console.error(`[FLIGHT LOOKUP] No providers found for tenant: ${tenantId}`);
      return NextResponse.json(
        { error: "No active providers configured for tenant" },
        { status: 404 }
      );
    }

    console.log(
      `[FLIGHT LOOKUP] Found ${providers.length} active providers:`,
      providers.map((p) => p.name)
    );

    const overrides = airline
      ? await getAirlineOverrides(tenantId, airline)
      : [];
    if (overrides.length > 0) {
      console.log(
        `[FLIGHT LOOKUP] Airline ${airline} has overrides:`,
        overrides
      );
    }

    const ordered = orderProviders(providers, overrides);
    console.log(
      `[FLIGHT LOOKUP] Provider order:`,
      ordered.map((p) => p.name)
    );

    // 3) Try providers until success
    let normalized: NormalizedFlight | null = null;
    let providerUsed: string | null = null;

    for (const p of ordered) {
      console.log(`[FLIGHT LOOKUP] Trying provider: ${p.name}`);
      const n = await tryProvider(
        p,
        flightNumber.toUpperCase(),
        flightDate
      );
      if (n) {
        normalized = n;
        providerUsed = p.name;
        console.log(`[FLIGHT LOOKUP] Success with provider: ${p.name}`);
        break;
      } else {
        console.log(`[FLIGHT LOOKUP] Provider ${p.name} returned no data`);
      }
    }

    if (!normalized) {
      console.warn(
        `[FLIGHT LOOKUP] No data from any provider after trying ${ordered.length} providers`
      );
      // Write negative cache to avoid thrash
      await supa.from("flight_status_cache").upsert({
        tenant_id: tenantId,
        flight_query: cacheKey,
        response: { normalized: null },
        fetched_at: new Date().toISOString(),
        expires_at: new Date(
          Date.now() + CACHE_TTL_SECONDS * 1000
        ).toISOString(),
      });
      return NextResponse.json({
        ok: false,
        error: "No data from any provider. The flight may not exist in any provider's database.",
      });
    }

    // Save positive cache
    const expiresAt = new Date(
      Date.now() + CACHE_TTL_SECONDS * 1000
    ).toISOString();
    await supa.from("flight_status_cache").upsert({
      tenant_id: tenantId,
      flight_query: cacheKey,
      response: { normalized: normalized, provider: providerUsed },
      fetched_at: new Date().toISOString(),
      expires_at: expiresAt,
    });

    await upsertInstance(tenantId, flightNumber, flightDate, normalized);
    return NextResponse.json({
      source: providerUsed || "provider",
      ok: true,
      flight: buildUpsertObj(flightNumber, flightDate, normalized),
      raw: normalized.raw,
    });
  } catch (error: any) {
    console.error("[FLIGHT LOOKUP] Unexpected error:", error);
    console.error("[FLIGHT LOOKUP] Error stack:", error.stack);
    return NextResponse.json(
      {
        error: error.message || "Internal server error",
        details: error.stack,
      },
      { status: 500 }
    );
  }
}

function orderProviders(
  all: ProviderCfg[],
  overrides: string[]
): ProviderCfg[] {
  // overrides first (in their order), then the rest in original order
  const map = new Map(all.map((p) => [p.name, p]));
  const result: ProviderCfg[] = [];

  for (const name of overrides) {
    const p = map.get(name as any);
    if (p) {
      result.push(p);
      map.delete(name as any);
    }
  }

  for (const p of map.values()) result.push(p);

  return result;
}

async function tryProvider(
  p: ProviderCfg,
  flightIata: string,
  flightDate?: string
): Promise<NormalizedFlight | null> {
  if (p.name === "aviationstack") {
    return await fetchFromAviationstack(
      p.baseUrl,
      p.apiKey,
      flightIata,
      flightDate
    );
  }
  if (p.name === "aerodatabox") {
    return await fetchFromAeroDataBox(
      p.baseUrl,
      p.apiKey,
      p.metadata || {},
      flightIata,
      flightDate
    );
  }
  return null;
}

function buildUpsertObj(
  flightNumber: string,
  flightDate: string | undefined,
  n: NormalizedFlight
) {
  const dateForKey =
    flightDate ??
    new Date().toISOString().slice(0, 10);
  return {
    flight_number: flightNumber.toUpperCase(),
    flight_date: dateForKey,
    airline_iata: n.airline_iata,
    airline_icao: n.airline_icao,
    dep_airport_iata: n.dep_iata,
    arr_airport_iata: n.arr_iata,
    scheduled_departure: n.scheduled_departure,
    scheduled_arrival: n.scheduled_arrival,
    estimated_departure: n.estimated_departure,
    estimated_arrival: n.estimated_arrival,
    status: n.status,
  };
}

async function upsertInstance(
  tenantId: string,
  flightNumber: string,
  flightDate: string | undefined,
  n: NormalizedFlight
) {
  const obj = buildUpsertObj(flightNumber, flightDate, n);
  const { error } = await supabaseAdmin.from("flight_instances").upsert(
    {
      tenant_id: tenantId,
      ...obj,
      raw: n.raw,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,flight_number,flight_date" }
  );

  if (error) {
    console.error("[FLIGHT LOOKUP] Error upserting flight instance:", error);
  }
}
