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
        const operations: Promise<{ error: any }>[] = [];
        
        if (apiKey) {
          operations.push(
            supa
              .from("tenant_secrets")
              .upsert(
                {
                  tenant_id: tenantId,
                  key: "anpr_api_key",
                  value: apiKey,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "tenant_id,key" }
              )
          );
        }
        
        if (baseUrl) {
          operations.push(
            supa
              .from("tenant_secrets")
              .upsert(
                {
                  tenant_id: tenantId,
                  key: "anpr_api_base_url",
                  value: baseUrl,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "tenant_id,key" }
              )
          );
        }

        // Execute all operations
        if (operations.length > 0) {
          const results = await Promise.all(operations);
          const errors = results.map((r) => r.error).filter(Boolean);
          
          if (errors.length > 0) {
            console.warn("Could not save to tenant_secrets using key-value approach:", errors);
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

