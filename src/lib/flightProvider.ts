import { supabaseAdmin } from "@/lib/supabase/server";

export async function getTenantAviationstack(tenantId: string) {
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("tenant_flight_providers")
    .select("provider_base_url, api_key, is_active")
    .eq("tenant_id", tenantId)
    .eq("provider_name", "aviationstack")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return { baseUrl: data.provider_base_url, apiKey: data.api_key as string };
}

