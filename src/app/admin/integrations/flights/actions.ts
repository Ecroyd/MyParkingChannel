"use server";

import { supabaseAdmin } from "@/lib/supabase/server";

type SaveArgs = {
  tenantId: string;
  providerName: "aviationstack" | "aerodatabox";
  baseUrl: string;
  apiKey: string;
  priority?: number;
  metadata?: Record<string, any>;
};

export async function upsertFlightProvider(args: SaveArgs) {
  const {
    tenantId,
    providerName,
    baseUrl,
    apiKey,
    priority = 100,
    metadata = {},
  } = args;

  if (!tenantId || !apiKey) {
    throw new Error("tenantId and apiKey required");
  }

  const { error } = await supabaseAdmin.from("tenant_flight_providers").upsert(
    {
      tenant_id: tenantId,
      provider_name: providerName,
      provider_base_url: baseUrl,
      api_key: apiKey,
      priority,
      metadata,
      is_active: true,
    },
    { onConflict: "tenant_id,provider_name" }
  );

  if (error) {
    console.error("Error saving flight provider:", error);
    throw error;
  }

  return { ok: true };
}

export async function setAirlineOverride(
  tenantId: string,
  airlineIata: string,
  providerName: "aviationstack" | "aerodatabox",
  priority = 1
) {
  if (!tenantId || !airlineIata || !providerName) {
    throw new Error("tenantId, airlineIata, and providerName required");
  }

  const { error } = await supabaseAdmin
    .from("tenant_airline_provider_overrides")
    .upsert(
      {
        tenant_id: tenantId,
        airline_iata: airlineIata.toUpperCase(),
        provider_name: providerName,
        priority,
      },
      { onConflict: "tenant_id,airline_iata,provider_name" }
    );

  if (error) {
    console.error("Error saving airline override:", error);
    throw error;
  }

  return { ok: true };
}

// Legacy function for backward compatibility
export async function saveAviationstackKey(tenantId: string, apiKey: string) {
  return await upsertFlightProvider({
    tenantId,
    providerName: "aviationstack",
    baseUrl: "https://api.aviationstack.com/v1/flights",
    apiKey,
    priority: 50,
  });
}
