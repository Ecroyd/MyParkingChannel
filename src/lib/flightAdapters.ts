export type NormalizedFlight = {
  airline_iata: string | null;
  airline_icao: string | null;
  dep_iata: string | null;
  arr_iata: string | null;
  scheduled_departure: string | null; // ISO UTC
  scheduled_arrival: string | null;
  estimated_departure: string | null;
  estimated_arrival: string | null;
  status: string | null;
  raw: any;
};

function toIsoOrNull(v?: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function fetchFromAviationstack(
  baseUrl: string,
  apiKey: string,
  flightIata: string,
  flightDate?: string
): Promise<NormalizedFlight | null> {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("access_key", apiKey);
    url.searchParams.set("flight_iata", flightIata);
    if (flightDate) url.searchParams.set("flight_date", flightDate);
    url.searchParams.set("limit", "100");

    console.log(
      `[AVIATIONSTACK] Fetching: ${url.toString().replace(/access_key=[^&]+/, "access_key=***")}`
    );

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`[AVIATIONSTACK] API error (${res.status})`);
      return null;
    }

    const json = await res.json();

    // Check for API errors
    if (json.error) {
      console.error("[AVIATIONSTACK] API returned error:", json.error);
      return null;
    }

    const list = Array.isArray(json?.data) ? json.data : [];
    if (list.length === 0) {
      console.log("[AVIATIONSTACK] Empty data array");
      return null;
    }

    const row = pickBestAviationstack(list, flightIata, flightDate);
    if (!row) return null;

    return {
      airline_iata: row?.airline?.iata ?? null,
      airline_icao: row?.airline?.icao ?? null,
      dep_iata: row?.departure?.iata ?? null,
      arr_iata: row?.arrival?.iata ?? null,
      scheduled_departure: toIsoOrNull(row?.departure?.scheduled),
      scheduled_arrival: toIsoOrNull(row?.arrival?.scheduled),
      estimated_departure: toIsoOrNull(row?.departure?.estimated),
      estimated_arrival: toIsoOrNull(row?.arrival?.estimated),
      status: row?.flight_status ?? null,
      raw: row,
    };
  } catch (error: any) {
    console.error("[AVIATIONSTACK] Fetch error:", error);
    return null;
  }
}

function pickBestAviationstack(
  rows: any[],
  flightIata: string,
  flightDate?: string
) {
  const upper = flightIata.toUpperCase();
  const exact = rows.find(
    (x) =>
      (x?.flight?.iata ?? "").toUpperCase() === upper &&
      (!flightDate || x?.flight_date === flightDate)
  );
  return exact || rows[0];
}

/**
 * AeroDataBox:
 *  - Option A (RapidAPI): GET https://aerodatabox.p.rapidapi.com/flights/number/{flight}/{date}
 *    Headers: X-RapidAPI-Key, X-RapidAPI-Host
 *  - Option B (Direct):    GET https://aerodatabox.com/flights/number/{flight}/{date}?withLocation=true
 *    Headers: X-Api-Key: <key>
 *
 * We support both via metadata:
 *   { "mode":"rapidapi", "rapidapiHost":"aerodatabox.p.rapidapi.com" }
 *   or { "mode":"direct" }
 */
export async function fetchFromAeroDataBox(
  baseUrl: string,
  apiKey: string,
  metadata: any,
  flightIata: string,
  flightDate?: string
): Promise<NormalizedFlight | null> {
  try {
    const date = flightDate ?? new Date().toISOString().slice(0, 10);
    // ensure baseUrl ends without trailing slash
    const root = baseUrl.replace(/\/+$/, "");
    const url = `${root}/flights/number/${encodeURIComponent(flightIata)}/${date}`;

    const headers: Record<string, string> = {};
    if ((metadata?.mode ?? "rapidapi") === "rapidapi") {
      headers["X-RapidAPI-Key"] = apiKey;
      headers["X-RapidAPI-Host"] =
        metadata?.rapidapiHost || "aerodatabox.p.rapidapi.com";
    } else {
      headers["X-Api-Key"] = apiKey;
    }

    console.log(`[AERODATABOX] Fetching: ${url} (mode: ${metadata?.mode || "rapidapi"})`);

    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`[AERODATABOX] API error (${res.status})`);
      return null;
    }

    const json = await res.json();

    // API returns arrays like { flights: [ ... ] } or direct array depending on route
    const list = Array.isArray(json?.flights)
      ? json.flights
      : Array.isArray(json)
      ? json
      : [];
    if (!list.length) {
      console.log("[AERODATABOX] Empty data array");
      return null;
    }

    const r = list[0];

    // Common fields (names vary by plan; handle defensively)
    const airlineIata =
      r?.airline?.iata || r?.airline?.codeIata || null;
    const airlineIcao =
      r?.airline?.icao || r?.airline?.codeIcao || null;
    const depIata =
      r?.departure?.airport?.iata ||
      r?.departure?.airport?.icao ||
      r?.departure?.airportIata ||
      null;
    const arrIata =
      r?.arrival?.airport?.iata ||
      r?.arrival?.airport?.icao ||
      r?.arrival?.airportIata ||
      null;

    const schedDep =
      r?.departure?.scheduledTimeUtc ||
      r?.departure?.scheduledTime ||
      r?.departure?.scheduledUtc;
    const schedArr =
      r?.arrival?.scheduledTimeUtc ||
      r?.arrival?.scheduledTime ||
      r?.arrival?.scheduledUtc;
    const estDep =
      r?.departure?.estimatedTimeUtc ||
      r?.departure?.estimatedTime ||
      r?.departure?.estimatedUtc;
    const estArr =
      r?.arrival?.estimatedTimeUtc ||
      r?.arrival?.estimatedTime ||
      r?.arrival?.estimatedUtc;

    const status = r?.status ?? r?.statusText ?? null;

    return {
      airline_iata: airlineIata ?? null,
      airline_icao: airlineIcao ?? null,
      dep_iata: depIata ?? null,
      arr_iata: arrIata ?? null,
      scheduled_departure: toIsoOrNull(schedDep),
      scheduled_arrival: toIsoOrNull(schedArr),
      estimated_departure: toIsoOrNull(estDep),
      estimated_arrival: toIsoOrNull(estArr),
      status: status,
      raw: r,
    };
  } catch (error: any) {
    console.error("[AERODATABOX] Fetch error:", error);
    return null;
  }
}

