// src/lib/suppliers/cavu.ts
import 'server-only';

const BASE_URL =
  process.env.CAVU_BASE_URL ||
  'https://parkcloud.azure-api.net/rest/operator/v1.svc/';
//                👆 NOTE THE TRAILING SLASH

export type CavuConfig = {
  operator_id: number;
  operator_private_key: string;
  subscription_key: string;
};

export type CavuEvent = {
  EventID: number;
  Reference: string;
  EventType: 'NEW' | 'AMEND' | 'CANCEL' | 'NOSHOW' | string;
  EventDate: string;
};

export type CavuBooking = {
  Reference: string;
  ArrivalDate: string;
  DepartureDate: string;
  CustomerName?: string;
  CustomerEmail?: string;
  VehicleReg?: string;
  VehicleMake?: string;
  VehicleModel?: string;
  VehicleColour?: string;
};

function buildUrl(path: string, config: CavuConfig) {
  // IMPORTANT: path has NO leading slash (e.g. "operators", "operator/7135/...")
  const url = new URL(path, BASE_URL);
  url.searchParams.set('key', config.operator_private_key);
  return url.toString();
}

async function cavuFetch<T>(
  path: string,
  config: CavuConfig,
  init: RequestInit = {}
): Promise<T> {
  if (!config.subscription_key) {
    throw new Error('[CAVU] Missing subscription_key in tenant config');
  }

  const url = buildUrl(path, config);

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'Ocp-Apim-Subscription-Key': config.subscription_key,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[CAVU] Error response', res.status, text);
    throw new Error(`CAVU request failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function getRecentEvents(
  config: CavuConfig,
  hours: number
): Promise<CavuEvent[]> {
  // becomes .../rest/operator/v1.svc/operator/7135/bookings/events/age/4?key=...
  const path = `operator/${config.operator_id}/bookings/events/age/${hours}`;
  return cavuFetch<CavuEvent[]>(path, config);
}

export async function getBookingDetails(
  config: CavuConfig,
  reference: string
): Promise<CavuBooking | null> {
  const path = `operator/${config.operator_id}/booking/${encodeURIComponent(
    reference
  )}`;
  return cavuFetch<CavuBooking>(path, config);
}

export async function getArrivalsForDate(
  config: CavuConfig,
  date: string // YYYY-MM-DD
) {
  const path = `operator/${config.operator_id}/bookings/arrivals/${date}`;
  return cavuFetch<any[]>(path, config);
}

export async function getDeparturesForDate(
  config: CavuConfig,
  date: string // YYYY-MM-DD
) {
  const path = `operator/${config.operator_id}/bookings/departures/${date}`;
  return cavuFetch<any[]>(path, config);
}

export async function getEventsByDate(
  config: CavuConfig,
  date: string // YYYY-MM-DD
): Promise<CavuEvent[]> {
  const path = `operator/${config.operator_id}/bookings/events/date/${date}`;
  return cavuFetch<CavuEvent[]>(path, config);
}

export async function getOperatorDetails(config: CavuConfig) {
  const path = `operator/${config.operator_id}`;
  return cavuFetch<any>(path, config);
}

export async function registerNoShow(
  config: CavuConfig,
  reference: string
) {
  const path = `operator/${config.operator_id}/booking/${encodeURIComponent(
    reference
  )}/NoShow`;

  return cavuFetch<any>(path, config, {
    method: 'PUT',
  });
}

// /rest/operator/v1.svc/operators?key=...
export async function getOperators(config: CavuConfig) {
  const url = new URL('operators', BASE_URL); // 👈 NO leading slash
  url.searchParams.set('key', config.operator_private_key);

  const fullUrl = url.toString();
  
  // Enhanced logging
  console.error('[CAVU] ===== getOperators DEBUG START =====');
  console.error('[CAVU] BASE_URL:', BASE_URL);
  console.error('[CAVU] Full URL:', fullUrl);
  console.error('[CAVU] Has subscription_key:', !!config.subscription_key);
  console.error('[CAVU] Has operator_private_key:', !!config.operator_private_key);
  console.error('[CAVU] Operator ID:', config.operator_id);

  const headers = {
    'Ocp-Apim-Subscription-Key': config.subscription_key,
    Accept: 'application/json',
  };
  console.error('[CAVU] Request headers:', JSON.stringify(headers, null, 2));

  const res = await fetch(fullUrl, {
    headers,
    cache: 'no-store',
  });

  console.error('[CAVU] Response status:', res.status);
  console.error('[CAVU] Response statusText:', res.statusText);
  const responseHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  console.error('[CAVU] Response headers:', JSON.stringify(responseHeaders, null, 2));

  if (!res.ok) {
    const text = await res.text();
    console.error('[CAVU] /operators error response body:', text);
    console.error('[CAVU] ===== getOperators DEBUG END =====');
    throw new Error(`CAVU /operators failed: ${res.status} ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';
  console.error('[CAVU] Content-Type:', contentType);

  // Handle XML response if needed
  if (contentType.includes('xml')) {
    const text = await res.text();
    console.error('[CAVU] XML response received, length:', text.length);
    console.error('[CAVU] XML preview:', text.substring(0, 500));
    // Try to parse as JSON anyway (sometimes XML APIs return JSON)
    try {
      const parsed = JSON.parse(text);
      console.error('[CAVU] Successfully parsed XML as JSON');
      console.error('[CAVU] ===== getOperators DEBUG END =====');
      return parsed as Promise<any[]>;
    } catch {
      console.error('[CAVU] Failed to parse XML as JSON');
      console.error('[CAVU] ===== getOperators DEBUG END =====');
      throw new Error('CAVU /operators returned XML instead of JSON');
    }
  }

  const json = await res.json();
  console.error('[CAVU] JSON response preview:', JSON.stringify(json).substring(0, 500));
  console.error('[CAVU] ===== getOperators DEBUG END =====');
  return json as Promise<any[]>;
}
