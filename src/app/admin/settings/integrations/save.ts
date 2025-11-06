"use server";

import { supabaseAdmin } from "@/lib/supabase/server";

export async function saveAnprSettings(formData: FormData) {
  const tenantId = formData.get("tenantId") as string;
  const provider = formData.get("provider") as string;
  const baseUrl = formData.get("baseUrl") as string;
  const apiKey = formData.get("apiKey") as string;

  if (!tenantId) throw new Error("Missing tenantId");

  const supa = supabaseAdmin();

  // Update tenant_settings - only anpr_provider (per your SQL schema)
  const { error: settingsError } = await supa
    .from("tenant_settings")
    .upsert(
      {
        tenant_id: tenantId,
        anpr_provider: provider || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" }
    );

  if (settingsError) {
    console.error("Error saving tenant_settings:", settingsError);
    throw new Error(`Failed to save settings: ${settingsError.message}`);
  }

  // Store API key and base URL in tenant_secrets (sensitive data)
  // Try column-based approach first (like stripe_secret_key)
  if (apiKey || baseUrl) {
    try {
      const secretsData: any = {
        tenant_id: tenantId,
        updated_at: new Date().toISOString(),
      };
      
      if (apiKey) {
        secretsData.anpr_api_key = apiKey;
      }
      
      if (baseUrl) {
        secretsData.anpr_api_base_url = baseUrl;
      }

      const { error: secretsError } = await supa
        .from("tenant_secrets")
        .upsert(secretsData, { onConflict: "tenant_id" });

      if (secretsError) {
        // If column-based doesn't work, try key-value approach
        // Execute operations individually to avoid type issues
        if (apiKey) {
          try {
            const { error: apiKeyError } = await supa
              .from("tenant_secrets")
              .upsert(
                {
                  tenant_id: tenantId,
                  key: "anpr_api_key",
                  value: apiKey,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "tenant_id,key" }
              );
            
            if (apiKeyError) {
              console.warn("Could not save API key to tenant_secrets:", apiKeyError);
            }
          } catch (err) {
            console.warn("Error saving API key to tenant_secrets:", err);
          }
        }
        
        if (baseUrl) {
          try {
            const { error: baseUrlError } = await supa
              .from("tenant_secrets")
              .upsert(
                {
                  tenant_id: tenantId,
                  key: "anpr_api_base_url",
                  value: baseUrl,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "tenant_id,key" }
              );
            
            if (baseUrlError) {
              console.warn("Could not save base URL to tenant_secrets:", baseUrlError);
            }
          } catch (err) {
            console.warn("Error saving base URL to tenant_secrets:", err);
          }
        }
      }
    } catch (err) {
      console.warn("Could not save to tenant_secrets:", err);
      throw new Error("Failed to save API credentials");
    }
  }

  return { ok: true };
}

