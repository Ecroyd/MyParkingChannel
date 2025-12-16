// src/lib/suppliers/cavu.ts
import 'server-only';

const rawBase =
  process.env.CAVU_BASE_URL ||
  'https://parkcloud.azure-api.net/rest/operator/v1.svc/';

export const BASE_URL = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

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
  Status?: string;
  OutboundFlight?: string;
  AmountPaid?: number;
  Customer?: {
    FirstName?: string;
    Surname?: string;
    Mobile?: string;
    Email?: string;
    Title?: string;
  };
  Vehicle?: {
    Registration?: string;
    Make?: string;
    Model?: string;
    Colour?: string;
  };
  SpecialRequests?: string;
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
  console.log('[CAVU DEBUG] Fetching:', url);
  console.log('[CAVU DEBUG] Headers:', {
    'Ocp-Apim-Subscription-Key': config.subscription_key ? '***present***' : 'MISSING',
    Accept: 'application/json',
  });

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
    const err: any = new Error(`CAVU request failed: ${res.status} ${text}`);
    if (res.status === 429) {
      err.code = 'CAVU_RATE_LIMIT';
    }
    throw err;
  }

  return res.json() as Promise<T>;
}

export async function getEventsByAge(
  config: CavuConfig,
  hours: number
): Promise<CavuEvent[]> {
  const path = `operator/${config.operator_id}/bookings/events/age/${hours}`;
  return cavuFetch<CavuEvent[]>(path, config);
}

// Alias for backward compatibility
export const getRecentEvents = getEventsByAge;

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

  const res = await fetch(fullUrl, {
    headers: {
      'Ocp-Apim-Subscription-Key': config.subscription_key,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    // Only log if it's not a 404 (404 is expected and handled gracefully)
    if (res.status !== 404) {
      console.error('[CAVU] /operators error', res.status, text);
    }
    throw new Error(`CAVU /operators failed: ${res.status} ${text}`);
  }

  const contentType = res.headers.get('content-type') || '';

  // Handle XML response if needed
  if (contentType.includes('xml')) {
    const text = await res.text();
    // Try to parse as JSON anyway (sometimes XML APIs return JSON)
    try {
      return JSON.parse(text) as Promise<any[]>;
    } catch {
      throw new Error('CAVU /operators returned XML instead of JSON');
    }
  }

  return res.json() as Promise<any[]>;
}
