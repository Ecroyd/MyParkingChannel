/**
 * Shared public-profile address helpers for tenant sites.
 * Never treat country-only values (UK/GB) as a complete address.
 */

const PLACEHOLDER_COUNTRIES = new Set([
  "uk",
  "gb",
  "gbr",
  "united kingdom",
  "great britain",
  "england",
]);

export type AddressLike = {
  street?: string | null;
  streetAddress?: string | null;
  city?: string | null;
  addressLocality?: string | null;
  county?: string | null;
  addressRegion?: string | null;
  postalCode?: string | null;
  postcode?: string | null;
  country?: string | null;
  addressCountry?: string | null;
} | null | undefined;

export function isPlaceholderCountry(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  return PLACEHOLDER_COUNTRIES.has(value.trim().toLowerCase());
}

export function hasUsableAddress(address: unknown, extras?: { county?: string | null; country?: string | null }): boolean {
  if (address && typeof address === "string") {
    const t = address.trim();
    if (!t || isPlaceholderCountry(t)) return false;
    return t.length > 3;
  }
  if (!address || typeof address !== "object") {
    // Only county/country extras → not usable
    return false;
  }
  const a = address as Record<string, unknown>;
  const street = String(a.street || a.streetAddress || "").trim();
  const city = String(a.city || a.addressLocality || "").trim();
  const postal = String(a.postalCode || a.postcode || "").trim();
  if (!street && !city && !postal) return false;
  if (!street && !city && postal.length <= 3) return false;
  return Boolean(street || city || postal);
}

export function formatAddressLines(args: {
  address?: AddressLike;
  county?: string | null;
  country?: string | null;
  branding?: {
    contact_address?: string | null;
    contact_city?: string | null;
    contact_postcode?: string | null;
    contact_country?: string | null;
  } | null;
}): string[] {
  const a = (args.address && typeof args.address === "object" ? args.address : {}) as Record<
    string,
    string | null | undefined
  >;
  const street =
    a.street ||
    a.streetAddress ||
    args.branding?.contact_address ||
    null;
  const city = a.city || a.addressLocality || args.branding?.contact_city || null;
  const county = args.county || a.county || a.addressRegion || null;
  const postal = a.postalCode || a.postcode || args.branding?.contact_postcode || null;
  const countryRaw =
    a.country || a.addressCountry || args.country || args.branding?.contact_country || null;

  if (!hasUsableAddress({ street, city, postalCode: postal })) {
    return [];
  }

  const lines: string[] = [];
  if (street?.trim()) lines.push(street.trim());
  const cityLine = [city, postal].filter((x) => x && String(x).trim()).join(" ");
  if (cityLine) lines.push(cityLine);
  if (county?.trim()) lines.push(county.trim());
  if (countryRaw?.trim() && !isPlaceholderCountry(countryRaw)) {
    lines.push(countryRaw.trim());
  }
  return lines;
}

export function formatAddressSingleLine(args: Parameters<typeof formatAddressLines>[0]): string | null {
  const lines = formatAddressLines(args);
  return lines.length ? lines.join(", ") : null;
}

export function mapsQueryFromProfile(args: {
  latitude?: number | string | null;
  longitude?: number | string | null;
  addressLine?: string | null;
}): string | null {
  if (args.latitude != null && args.longitude != null && String(args.latitude) !== "" && String(args.longitude) !== "") {
    return `${args.latitude},${args.longitude}`;
  }
  return args.addressLine?.trim() || null;
}
