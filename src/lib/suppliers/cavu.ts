// src/lib/suppliers/cavu.ts
import 'server-only';

const BASE_URL = process.env.CAVU_BASE_URL!;
const SUBSCRIPTION_KEY = process.env.CAVU_SUBSCRIPTION_KEY!;

if (!BASE_URL || !SUBSCRIPTION_KEY) {
  console.warn('[CAVU] Missing CAVU_BASE_URL or CAVU_SUBSCRIPTION_KEY env vars');
}

export type CavuConfig = {
  operator_id: number;
  operator_private_key: string;
  // optional: operator_specific_subscription_key?: string; // future
};

export type CavuEvent = {
  EventID: number;
  Reference: string;
  EventType: 'NEW' | 'AMEND' | 'CANCEL' | 'NOSHOW' | string;
  EventDate: string; // ISO
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
  // add any other fields you care about from their schema
};

function buildUrl(path: string, config: CavuConfig) {
  const url = new URL(path, BASE_URL);
  url.searchParams.set('key', config.operator_private_key);
  // you CAN also pass subscription-key via query, but header is nicer
  return url.toString();
}

async function cavuFetch<T>(
  path: string,
  config: CavuConfig,
  init: RequestInit = {}
): Promise<T> {
  const url = buildUrl(path, config);

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
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

// Get recent events (last N hours) for an operator
export async function getRecentEvents(
  config: CavuConfig,
  hours: number
): Promise<CavuEvent[]> {
  // GET /operator/{operator_id}/bookings/events/age/{hours}?key=...
  const path = `/operator/${config.operator_id}/bookings/events/age/${hours}`;
  return cavuFetch<CavuEvent[]>(path, config);
}

// Get full booking details by reference
export async function getBookingDetails(
  config: CavuConfig,
  reference: string
): Promise<CavuBooking | null> {
  // GET /operator/{operator_id}/booking/{reference}?key=...
  const path = `/operator/${config.operator_id}/booking/${encodeURIComponent(
    reference
  )}`;
  return cavuFetch<CavuBooking>(path, config);
}



