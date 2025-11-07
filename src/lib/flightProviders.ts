import { supabaseAdmin } from "@/lib/supabase/server";

export type ProviderCfg = {
  name: "aviationstack" | "aerodatabox";
  baseUrl: string;
  apiKey: string;
  metadata?: Record<string, any>;
  priority: number;
};

export async function getActiveProviders(tenantId: string): Promise<ProviderCfg[]> {
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("tenant_flight_providers")
    .select("provider_name, provider_base_url, api_key, metadata, priority, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error || !data) {
    console.error("[FLIGHT PROVIDERS] Error fetching providers:", error);
    return [];
  }

  return data.map((row: any) => ({
    name: row.provider_name as ProviderCfg["name"],
    baseUrl: row.provider_base_url,
    apiKey: row.api_key,
    metadata: row.metadata || {},
    priority: row.priority || 100,
  }));
}

export async function getAirlineOverrides(
  tenantId: string,
  airlineIata: string
): Promise<string[]> {
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("tenant_airline_provider_overrides")
    .select("provider_name, priority")
    .eq("tenant_id", tenantId)
    .eq("airline_iata", airlineIata.toUpperCase())
    .order("priority", { ascending: true });

  if (error || !data) {
    console.error("[FLIGHT PROVIDERS] Error fetching airline overrides:", error);
    return [];
  }

  return data.map((r: any) => r.provider_name as ProviderCfg["name"]);
}

// Extract IATA prefix (letters) from "BA123", "FR 654", etc.
export function extractAirlineIataPrefix(flightNumber: string): string | null {
  const cleaned = flightNumber.replace(/\s+/g, "");
  const m = cleaned.match(/^([A-Za-z]{2,3})\d+/);
  return m ? m[1].toUpperCase() : null;
}

