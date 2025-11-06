"use server";

import { supabaseAdmin } from "@/lib/supabase/server";

export async function saveAviationstackKey(tenantId: string, apiKey: string) {
  if (!tenantId || !apiKey) {
    throw new Error("tenantId and apiKey required");
  }

  const up = {
    tenant_id: tenantId,
    provider_name: "aviationstack",
    provider_base_url: "http://api.aviationstack.com/v1/flights",
    api_key: apiKey,
    is_active: true,
  };

  const { error } = await supabaseAdmin
    .from("tenant_flight_providers")
    .upsert(up, { onConflict: "tenant_id,provider_name" });

  if (error) {
    console.error("Error saving Aviationstack key:", error);
    throw error;
  }

  return { ok: true };
}

